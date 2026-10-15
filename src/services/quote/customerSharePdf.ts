import type { CustomerSharePublicOption, CustomerSharePublicView } from '../../types';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const RIGHT = 48;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;

type Font = 'regular' | 'bold';

function ascii(value: unknown): string {
  return String(value ?? '')
    .replaceAll('₹', 'INR ')
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function money(value: number, currency: string): string {
  return `${ascii(currency || 'INR')} ${Math.round(value).toLocaleString('en-IN')}`;
}

function friendlyDate(value?: string): string {
  if (!value) return 'Dates to be confirmed';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? ascii(value)
    : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function wrap(value: string, size: number, width: number): string[] {
  const normalized = ascii(value);
  if (!normalized) return [];
  const max = Math.max(8, Math.floor(width / (size * 0.52)));
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > max) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += max) lines.push(word.slice(index, index + max));
      line = '';
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > max && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

class PdfLayout {
  pages: string[] = [];
  private commands: string[] = [];
  private y = PAGE_HEIGHT - 122;

  constructor(private readonly title: string, private readonly version: number) {
    this.startPage();
  }

  private startPage(): void {
    if (this.commands.length) this.pages.push(this.commands.join('\n'));
    this.commands = [
      '0.31 0.22 0.67 rg 0 770 595 72 re f',
      '1 1 1 rg BT /F2 20 Tf 48 808 Td (BOOKING BRIDGE) Tj ET',
      '0.89 0.86 1 rg BT /F1 9 Tf 48 790 Td (Travel, thoughtfully arranged) Tj ET',
      `1 1 1 rg BT /F2 10 Tf 455 802 Td (${pdfEscape(`QUOTE V${this.version}`)}) Tj ET`,
      `0.32 0.28 0.42 rg BT /F1 8 Tf 48 36 Td (${pdfEscape(ascii(this.title))}) Tj ET`,
    ];
    this.y = PAGE_HEIGHT - 106;
  }

  private ensure(height: number): void {
    if (this.y - height < 58) this.startPage();
  }

  rect(x: number, top: number, width: number, height: number, color: [number, number, number]): void {
    const bottom = PAGE_HEIGHT - top - height;
    this.commands.push(`${color.join(' ')} rg ${x} ${bottom} ${width} ${height} re f`);
  }

  text(value: string, options: { size?: number; font?: Font; color?: [number, number, number]; indent?: number; width?: number; leading?: number; before?: number; after?: number } = {}): void {
    const size = options.size ?? 10;
    const leading = options.leading ?? size * 1.35;
    const indent = options.indent ?? 0;
    const width = options.width ?? CONTENT_WIDTH - indent;
    const lines = wrap(value, size, width);
    if (!lines.length) return;
    const height = lines.length * leading + (options.before ?? 0) + (options.after ?? 0);
    this.ensure(height);
    this.y -= options.before ?? 0;
    const color = options.color ?? [0.16, 0.18, 0.24];
    for (const line of lines) {
      this.commands.push(`${color.join(' ')} rg BT /F${options.font === 'bold' ? '2' : '1'} ${size} Tf ${LEFT + indent} ${this.y} Td (${pdfEscape(line)}) Tj ET`);
      this.y -= leading;
    }
    this.y -= options.after ?? 0;
  }

  rule(before = 6, after = 10): void {
    this.ensure(before + after + 1);
    this.y -= before;
    this.commands.push(`0.88 0.86 0.94 RG 0.7 w ${LEFT} ${this.y} m ${PAGE_WIDTH - RIGHT} ${this.y} l S`);
    this.y -= after;
  }

  section(title: string): void {
    this.ensure(34);
    this.y -= 8;
    this.commands.push(`0.96 0.95 1 rg ${LEFT} ${this.y - 17} ${CONTENT_WIDTH} 25 re f`);
    this.commands.push(`0.31 0.22 0.67 rg BT /F2 12 Tf ${LEFT + 10} ${this.y - 10} Td (${pdfEscape(ascii(title).toUpperCase())}) Tj ET`);
    this.y -= 34;
  }

  pageBreak(): void {
    this.startPage();
  }

  optionCard(option: CustomerSharePublicOption): void {
    const highlights = [...option.hotelHighlights, ...option.transportHighlights, ...option.includedActivityHighlights].slice(0, 3);
    const height = 62 + highlights.length * 12;
    this.ensure(height + 10);
    const top = PAGE_HEIGHT - this.y;
    this.rect(LEFT, top, CONTENT_WIDTH, height, option.recommended ? [0.94, 0.98, 0.94] : [0.97, 0.97, 0.99]);
    this.commands.push(`0.16 0.18 0.24 rg BT /F2 13 Tf ${LEFT + 14} ${this.y - 20} Td (${pdfEscape(ascii(option.label).toUpperCase())}) Tj ET`);
    if (option.recommended) this.commands.push(`0.13 0.50 0.29 rg BT /F2 9 Tf ${LEFT + 150} ${this.y - 19} Td (RECOMMENDED) Tj ET`);
    this.commands.push(`0.31 0.22 0.67 rg BT /F2 15 Tf ${PAGE_WIDTH - RIGHT - 125} ${this.y - 20} Td (${pdfEscape(money(option.packageSellingPrice, option.currency))}) Tj ET`);
    let lineY = this.y - 40;
    for (const highlight of highlights) {
      this.commands.push(`0.32 0.35 0.42 rg BT /F1 9 Tf ${LEFT + 14} ${lineY} Td (${pdfEscape(ascii(`- ${highlight}`))}) Tj ET`);
      lineY -= 12;
    }
    this.y -= height + 10;
  }

  finish(): string[] {
    if (this.commands.length) this.pages.push(this.commands.join('\n'));
    const count = this.pages.length;
    return this.pages.map((commands, index) => `${commands}\n0.42 0.40 0.48 rg BT /F1 8 Tf 493 36 Td (Page ${index + 1} of ${count}) Tj ET`);
  }
}

function addList(layout: PdfLayout, values: string[], empty: string): void {
  if (!values.length) layout.text(empty, { color: [0.42, 0.44, 0.50] });
  for (const value of values) layout.text(`- ${value}`, { indent: 8, after: 2 });
}

function addOptionDetail(layout: PdfLayout, option: CustomerSharePublicOption): void {
  const pkg = option.package;
  layout.section(`${option.label}${option.recommended ? ' - Recommended' : ''}`);
  layout.text(`${money(option.packageSellingPrice, option.currency)} package price`, { size: 16, font: 'bold', color: [0.31, 0.22, 0.67], after: 8 });
  layout.text(`${pkg.travelerCount} guest${pkg.travelerCount === 1 ? '' : 's'} | Valid until ${friendlyDate(option.validUntil)}`, { color: [0.38, 0.40, 0.47], after: 4 });

  layout.text('Hotels', { size: 11, font: 'bold', before: 8, after: 4 });
  addList(layout, pkg.hotels.map(hotel => `${hotel.hotelName} - ${hotel.roomCategoryName}, ${hotel.mealPlan} meal plan, ${hotel.rooms} room${hotel.rooms === 1 ? '' : 's'} for ${hotel.nights} night${hotel.nights === 1 ? '' : 's'}`), 'Hotel details to be confirmed.');

  layout.text('Transport', { size: 11, font: 'bold', before: 8, after: 4 });
  addList(layout, pkg.transports.map(item => `${item.vehicleName} - ${item.route || `${item.days} service day${item.days === 1 ? '' : 's'}`}`), 'Transport details to be confirmed.');

  const included = pkg.activities.filter(item => item.inclusionStatus !== 'OPTIONAL' && item.inclusionStatus !== 'NOT_INCLUDED');
  const optional = pkg.activities.filter(item => item.inclusionStatus === 'OPTIONAL');
  layout.text('Included experiences', { size: 11, font: 'bold', before: 8, after: 4 });
  addList(layout, included.map(item => item.activityName), 'No included experiences listed.');
  if (optional.length) {
    layout.text('Optional experiences', { size: 11, font: 'bold', before: 8, after: 4 });
    addList(layout, optional.map(item => `${item.activityName} - available at additional cost`), '');
  }

  layout.section('Day-by-day itinerary');
  for (const day of pkg.itinerary) {
    layout.text(`Day ${day.dayNumber}: ${day.title}`, { size: 11, font: 'bold', before: 6, after: 2 });
    layout.text(`${friendlyDate(day.date)}${day.location ? ` | ${day.location}` : ''}`, { size: 9, color: [0.42, 0.44, 0.50], after: 3 });
    if (day.description) layout.text(day.description, { after: 3 });
    for (const item of day.items) {
      const optionalLabel = item.inclusionStatus === 'OPTIONAL' ? ' (Optional - additional cost)' : '';
      layout.text(`- ${item.title}${optionalLabel}`, { indent: 8, size: 9, after: 2 });
    }
  }

  layout.section('Included in your package');
  addList(layout, pkg.inclusions, 'No inclusions listed.');
  layout.text('Optional experiences', { size: 11, font: 'bold', before: 8, after: 4 });
  addList(layout, optional.map(item => `${item.activityName} - available at additional cost`), 'No optional experiences listed.');
  layout.text('Exclusions', { size: 11, font: 'bold', before: 8, after: 4 });
  addList(layout, pkg.exclusions, 'No exclusions listed.');
  layout.text('Terms and cancellation', { size: 11, font: 'bold', before: 8, after: 4 });
  layout.text(pkg.termsAndConditions || 'Services remain subject to availability. Cancellation terms will be confirmed at booking.', { after: 12 });
  layout.rule();
}

function assemblePdf(pageStreams: string[], title: string): Uint8Array {
  const objects: string[] = [];
  const add = (value: string) => { objects.push(value); return objects.length; };
  add(''); // catalog
  add(''); // pages
  const regularFont = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFont = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds: number[] = [];
  for (const stream of pageStreams) {
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFont} 0 R /F2 ${boldFont} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  const infoId = add(`<< /Title (${pdfEscape(ascii(title))}) /Author (Booking Bridge) /Subject (Customer holiday package) /Creator (Booking Bridge OS) >>`);
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n%BBOS\n')];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets[index + 1] = length;
    const chunk = encoder.encode(`${index + 1} 0 obj\n${object}\nendobj\n`);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xrefOffset = length;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('');
  chunks.push(encoder.encode(xref));
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

export function customerSharePdfFilename(snapshot: CustomerSharePublicView, year = new Date().getUTCFullYear()): string {
  const destination = ascii(snapshot.destination).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Holiday';
  const customer = ascii(snapshot.preparedFor).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Guest';
  return `Booking-Bridge-${destination}-Package-${customer}-${year}.pdf`;
}

export function buildCustomerSharePdf(snapshot: CustomerSharePublicView, version: number): Uint8Array {
  const layout = new PdfLayout(snapshot.title, version);
  layout.text(snapshot.title, { size: 23, font: 'bold', color: [0.16, 0.18, 0.24], after: 8 });
  layout.text(`Prepared for ${snapshot.preparedFor}`, { size: 13, font: 'bold', color: [0.31, 0.22, 0.67], after: 6 });
  layout.text(`Travel: ${friendlyDate(snapshot.travelStartDate)} to ${friendlyDate(snapshot.travelEndDate)} | ${snapshot.travelerCount} guest${snapshot.travelerCount === 1 ? '' : 's'}`, { after: 3 });
  layout.text(`Frozen Quote Group V${version} | Prepared ${friendlyDate(snapshot.frozenAt)}`, { size: 9, color: [0.42, 0.44, 0.50], after: 10 });
  layout.section('Package options');
  for (const option of snapshot.options) layout.optionCard(option);
  layout.text('All prices shown are customer package prices. Optional experiences are not included unless stated.', { size: 9, color: [0.42, 0.44, 0.50], after: 8 });
  layout.rule();
  for (const option of snapshot.options) {
    layout.pageBreak();
    addOptionDetail(layout, option);
  }
  return assemblePdf(layout.finish(), `${snapshot.title} - Quote V${version}`);
}
