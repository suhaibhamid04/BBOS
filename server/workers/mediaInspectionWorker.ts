import { open, stat } from 'node:fs/promises';
import sharp from 'sharp';

interface WorkerRequest {
  mode: 'ORIGINAL' | 'PREVIEW';
  category: 'IMAGE' | 'VIDEO' | 'AUDIO';
  declaredContentType: string;
  sourcePath: string;
  outputPath?: string;
}

interface InspectionResult {
  detectedContentType: string;
  detectedContainer?: string;
  detectedCodecs: string[];
  durationMs?: number;
  width?: number;
  height?: number;
  thumbnail?: { path: string; contentType: 'image/webp'; bytes: number };
}

function fail(message: string): never { throw new Error(message); }

function detectedType(header: Buffer): { contentType: string; container: string } {
  if (header.length >= 12 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: 'image/png', container: 'png' };
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { contentType: 'image/jpeg', container: 'jpeg' };
  if (header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') return { contentType: 'image/webp', container: 'webp' };
  if (header.length >= 12 && header.toString('ascii', 4, 8) === 'ftyp') {
    const brand = header.toString('ascii', 8, 12);
    return brand === 'qt  ' ? { contentType: 'video/quicktime', container: 'mov' } : { contentType: 'video/mp4', container: 'mp4' };
  }
  if (header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { contentType: 'video/webm', container: 'webm' };
  if (header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE') return { contentType: 'audio/wav', container: 'wav' };
  if (header.length >= 3 && header.toString('ascii', 0, 3) === 'ID3') return { contentType: 'audio/mpeg', container: 'mp3' };
  fail('Unsupported or unrecognized media signature.');
}

async function inspectMp4(filePath: string, fileSize: number): Promise<Pick<InspectionResult, 'durationMs' | 'width' | 'height'> & { validStructure: boolean }> {
  let durationMs: number | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let hasMoov = false;
  let hasMediaData = false;
  const containers = new Set(['moov', 'trak', 'mdia']);
  let boxesVisited = 0;
  const file = await open(filePath, 'r');

  const readAt = async (position: number, length: number) => {
    const buffer = Buffer.alloc(length);
    const result = await file.read(buffer, 0, length, position);
    return buffer.subarray(0, result.bytesRead);
  };

  const walk = async (start: number, end: number, depth: number): Promise<void> => {
    if (depth > 6) return;
    let offset = start;
    while (offset + 8 <= end) {
      if (++boxesVisited > 20_000) fail('MP4 contains too many nested boxes.');
      const headerBytes = await readAt(offset, 16);
      if (headerBytes.length < 8) return;
      let size = headerBytes.readUInt32BE(0);
      const type = headerBytes.toString('ascii', 4, 8);
      let header = 8;
      if (size === 1 && offset + 16 <= end) {
        const large = headerBytes.readBigUInt64BE(8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return;
        size = Number(large);
        header = 16;
      }
      if (size === 0) size = end - offset;
      if (size < header || offset + size > end) return;
      const body = offset + header;
      if (type === 'moov') hasMoov = true;
      if (type === 'mdat') hasMediaData = true;
      if (type === 'mvhd' && body + 20 <= offset + size) {
        const mvhd = await readAt(body, Math.min(40, offset + size - body));
        const version = mvhd[0];
        const timeOffset = version === 1 ? 20 : 12;
        const durationOffset = version === 1 ? 24 : 16;
        if (durationOffset + (version === 1 ? 8 : 4) <= mvhd.length) {
          const timescale = mvhd.readUInt32BE(timeOffset);
          const duration = version === 1 ? Number(mvhd.readBigUInt64BE(durationOffset)) : mvhd.readUInt32BE(durationOffset);
          if (timescale > 0 && duration >= 0) durationMs = Math.round((duration / timescale) * 1000);
        }
      }
      if (type === 'tkhd' && size >= 16) {
        const dimensions = await readAt(offset + size - 8, 8);
        if (dimensions.length < 8) return;
        const candidateWidth = Math.floor(dimensions.readUInt32BE(0) / 65536);
        const candidateHeight = Math.floor(dimensions.readUInt32BE(4) / 65536);
        if (candidateWidth > 0 && candidateHeight > 0 && candidateWidth * candidateHeight <= 100_000_000) {
          if (!width || candidateWidth * candidateHeight > width * (height || 0)) {
            width = candidateWidth;
            height = candidateHeight;
          }
        }
      }
      if (containers.has(type)) await walk(body, offset + size, depth + 1);
      offset += size;
    }
  };
  try {
    await walk(0, fileSize, 0);
    return { validStructure: hasMoov && hasMediaData, ...(durationMs === undefined ? {} : { durationMs }), ...(width === undefined ? {} : { width, height }) };
  } finally {
    await file.close();
  }
}

async function normalizeThumbnail(sourcePath: string, outputPath: string): Promise<{ path: string; contentType: 'image/webp'; bytes: number; width: number; height: number }> {
  const pipeline = sharp(sourcePath, { failOn: 'warning', limitInputPixels: 50_000_000, animated: false });
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height || metadata.width > 12_000 || metadata.height > 12_000) fail('Image dimensions are missing or exceed the approved limit.');
  await pipeline.rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(outputPath);
  return { path: outputPath, contentType: 'image/webp', bytes: (await stat(outputPath)).size, width: metadata.width, height: metadata.height };
}

async function run(request: WorkerRequest): Promise<InspectionResult> {
  const details = await stat(request.sourcePath);
  if (!details.isFile() || details.size <= 0) fail('Media object is empty.');
  if (request.mode === 'PREVIEW' && details.size > 8 * 1024 * 1024) fail('Preview input exceeds 8 MiB.');
  const header = Buffer.alloc(Math.min(4096, details.size));
  const handle = await open(request.sourcePath, 'r');
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  const detected = detectedType(header);

  if (request.mode === 'PREVIEW') {
    if (!detected.contentType.startsWith('image/') || !request.outputPath) fail('Preview input must be a supported image.');
    const thumbnail = await normalizeThumbnail(request.sourcePath, request.outputPath);
    return { detectedContentType: thumbnail.contentType, detectedContainer: 'webp', detectedCodecs: [], width: thumbnail.width, height: thumbnail.height, thumbnail };
  }

  if (detected.contentType !== request.declaredContentType) fail('Detected media type does not match the declaration.');
  if (!detected.contentType.toLowerCase().startsWith(`${request.category.toLowerCase()}/`)) fail('Detected media category does not match the declaration.');

  if (request.category === 'IMAGE') {
    if (!request.outputPath) fail('Image inspection requires a thumbnail output path.');
    const thumbnail = await normalizeThumbnail(request.sourcePath, request.outputPath);
    return {
      detectedContentType: detected.contentType,
      detectedContainer: detected.container,
      detectedCodecs: [],
      width: thumbnail.width,
      height: thumbnail.height,
      thumbnail,
    };
  }

  if (detected.container === 'mp4' || detected.container === 'mov') {
    const inspection = await inspectMp4(request.sourcePath, details.size);
    if (!inspection.validStructure) fail('MP4/QuickTime structure is missing required movie or media-data boxes.');
    const { validStructure: _validStructure, ...metadata } = inspection;
    return { detectedContentType: detected.contentType, detectedContainer: detected.container, detectedCodecs: [], ...metadata };
  }

  if (detected.container === 'webm') {
    if (details.size < 512 || header.indexOf(Buffer.from([0x18, 0x53, 0x80, 0x67])) < 0) fail('WebM structure is incomplete.');
    return { detectedContentType: detected.contentType, detectedContainer: detected.container, detectedCodecs: [] };
  }

  return { detectedContentType: detected.contentType, detectedContainer: detected.container, detectedCodecs: [] };
}

const request = JSON.parse(await Bun.stdin.text()) as WorkerRequest;
try {
  process.stdout.write(JSON.stringify({ ok: true, result: await run(request) }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Media inspection failed.' }));
  process.exitCode = 1;
}
