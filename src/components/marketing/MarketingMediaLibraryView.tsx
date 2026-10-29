import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Uppy from '@uppy/core';
import {
  AlertCircle, CheckCircle2, FileVideo, Grid2X2, Image as ImageIcon, List, Loader2,
  Pause, Play, RefreshCw, Search, ShieldCheck, Tags, UploadCloud, X, XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  cancelMediaUpload, completeMediaUpload, createMediaAsset, createMediaUploadSession,
  decideMediaRights, fetchMediaPreview, getMediaUploadSession, listMediaLibrary,
  submitMediaRights, updateMediaMetadata, uploadMediaChunk, uploadMediaPreview,
  type MediaAssetDetailDto, type MediaCategory,
} from '../../services/marketing/mediaLibraryApi';

type QueueStatus = 'QUEUED' | 'UPLOADING' | 'PAUSED' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'CANCELLED';
interface QueueItem { id: string; name: string; size: number; progress: number; status: QueueStatus; assetId?: string; sessionId?: string; error?: string }

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function statusTone(status: string): string {
  if (['READY', 'VERIFIED', 'COMPLETE'].includes(status)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['REJECTED', 'FAILED', 'INVALID'].includes(status)) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (['VALIDATING', 'PROCESSING', 'UPLOADING', 'SUBMITTED'].includes(status)) return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

async function captureVideoPreview(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'metadata';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Video preview timed out.')), 8_000);
      video.onloadeddata = () => { window.clearTimeout(timeout); resolve(); };
      video.onerror = () => { window.clearTimeout(timeout); reject(new Error('Video preview is unavailable.')); };
    });
    if (Number.isFinite(video.duration) && video.duration > 0.2) {
      video.currentTime = Math.min(1, video.duration / 4);
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
    }
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
  } catch {
    return null;
  } finally {
    video.src = '';
    URL.revokeObjectURL(url);
  }
}

const initialRights = () => ({
  sourceOrContributor: '', ownershipBasis: 'BOOKING_BRIDGE_OWNED', subjectConsentRequired: false,
  subjectConsentConfirmed: false, influencerRestrictions: '', permittedSocialChannels: 'Instagram, Facebook',
  permittedTerritories: 'India', validFrom: new Date().toISOString().slice(0, 10), validUntil: '',
  musicRights: 'NOT_APPLICABLE', commercialAdvertisingAllowed: false, evidenceReference: '',
});

export const MarketingMediaLibraryView: React.FC = () => {
  const { currentUser } = useAuth();
  const [library, setLibrary] = useState<MediaAssetDetailDto[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'ALL' | MediaCategory>('ALL');
  const [view, setView] = useState<'GRID' | 'LIST'>('GRID');
  const [selectedId, setSelectedId] = useState<string>();
  const [tagText, setTagText] = useState('');
  const [rights, setRights] = useState(initialRights);
  const [decisionReason, setDecisionReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const controllers = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);
  const [uppy] = useState(() => new Uppy({
    autoProceed: false,
    restrictions: { maxNumberOfFiles: 20, maxFileSize: 5 * 1024 * 1024 * 1024, allowedFileTypes: acceptedTypes },
  }));

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => () => uppy.destroy(), [uppy]);

  const updateQueue = useCallback((id: string, update: Partial<QueueItem>) => {
    setQueue(items => items.map(item => item.id === id ? { ...item, ...update } : item));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setLibrary(await listMediaLibrary(currentUser.employeeId)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load media.'); }
    finally { setLoading(false); }
  }, [currentUser.employeeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let active = true;
    const oldUrls = { ...previewUrls };
    const load = async () => {
      const next: Record<string, string> = {};
      await Promise.all(library.filter(item => item.derivedObjects.some(object => object.kind === 'THUMBNAIL' || object.kind === 'PREVIEW')).map(async item => {
        try {
          const blob = await fetchMediaPreview(currentUser.employeeId, item.asset.id);
          if (active) next[item.asset.id] = URL.createObjectURL(blob);
        } catch { /* an unavailable preview renders the safe placeholder */ }
      }));
      if (active) setPreviewUrls(next);
      Object.values(oldUrls).forEach(URL.revokeObjectURL);
    };
    void load();
    return () => { active = false; };
    // Reload previews only when authoritative library records change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, currentUser.employeeId]);

  const selected = library.find(item => item.asset.id === selectedId);
  useEffect(() => {
    if (!selected) return;
    setTagText(selected.asset.tags.join(', '));
    setRights(initialRights());
    setDecisionReason('');
  }, [selectedId]);

  const uploadOne = useCallback(async (fileId: string) => {
    const uppyFile = uppy.getFile(fileId);
    if (!uppyFile) return;
    const file = uppyFile.data as File;
    let item = queueRef.current.find(candidate => candidate.id === fileId);
    if (!item) return;
    const controller = new AbortController();
    controllers.current.set(fileId, controller);
    cancelled.current.delete(fileId);
    updateQueue(fileId, { status: 'UPLOADING', error: undefined });
    try {
      let assetId = item.assetId;
      let sessionId = item.sessionId;
      if (!assetId) {
        const asset = await createMediaAsset(currentUser.employeeId, file);
        assetId = asset.id;
        updateQueue(fileId, { assetId });
      }
      if (!sessionId) {
        const session = await createMediaUploadSession(currentUser.employeeId, assetId, file);
        sessionId = session.id;
        updateQueue(fileId, { sessionId });
      }
      let session = await getMediaUploadSession(currentUser.employeeId, sessionId);
      if (session.state === 'EXPIRED') throw new Error('Upload session expired. Start a new upload.');
      let offset = session.uploadedBytes;
      while (offset < file.size) {
        const end = Math.min(offset + session.chunkSizeBytes, file.size);
        session = await uploadMediaChunk(currentUser.employeeId, sessionId, offset, file.slice(offset, end), controller.signal);
        offset = session.uploadedBytes;
        const progress = Math.round((offset / file.size) * 100);
        uppy.setFileState(fileId, { progress: { uploadStarted: Date.now(), uploadComplete: false, percentage: progress, bytesUploaded: offset, bytesTotal: file.size } });
        updateQueue(fileId, { progress });
      }
      updateQueue(fileId, { status: 'PROCESSING', progress: 100 });
      const completed = await completeMediaUpload(currentUser.employeeId, sessionId);
      if (completed.asset.category === 'VIDEO' && completed.asset.lifecycleState === 'READY') {
        const preview = await captureVideoPreview(file);
        if (preview) await uploadMediaPreview(currentUser.employeeId, completed.asset.id, preview);
      }
      updateQueue(fileId, {
        status: completed.asset.lifecycleState === 'READY' ? 'COMPLETE' : 'FAILED',
        error: completed.asset.lifecycleState === 'READY' ? undefined : completed.currentVersion?.validationErrors[0] || 'Media validation failed.',
      });
      await refresh();
      setSelectedId(completed.asset.id);
    } catch (uploadError) {
      if (uploadError instanceof DOMException && uploadError.name === 'AbortError') {
        if (!cancelled.current.has(fileId)) updateQueue(fileId, { status: 'PAUSED' });
      } else {
        updateQueue(fileId, { status: 'FAILED', error: uploadError instanceof Error ? uploadError.message : 'Upload failed.' });
      }
    } finally {
      controllers.current.delete(fileId);
    }
  }, [currentUser.employeeId, refresh, updateQueue, uppy]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setError('');
    for (const file of Array.from(files)) {
      try {
        const id = uppy.addFile({ name: file.name, type: file.type, data: file, source: 'media-library' });
        setQueue(items => [...items, { id, name: file.name, size: file.size, progress: 0, status: 'QUEUED' }]);
        window.setTimeout(() => void uploadOne(id), 0);
      } catch (fileError) {
        setError(fileError instanceof Error ? fileError.message : `${file.name} is not supported.`);
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const pauseUpload = (id: string) => controllers.current.get(id)?.abort();
  const cancelUpload = async (item: QueueItem) => {
    cancelled.current.add(item.id);
    controllers.current.get(item.id)?.abort();
    try { if (item.sessionId) await cancelMediaUpload(currentUser.employeeId, item.sessionId); }
    finally { updateQueue(item.id, { status: 'CANCELLED' }); }
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return library.filter(item => (category === 'ALL' || item.asset.category === category) && (!needle || [
      item.asset.displayFilename, ...item.asset.tags, item.currentRights?.sourceOrContributor || '', item.asset.rightsStatus,
    ].some(value => value.toLowerCase().includes(needle))));
  }, [library, search, category]);

  const saveTags = async () => {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      await updateMediaMetadata(currentUser.employeeId, selected.asset, [...new Set<string>(tagText.split(',').map(tag => tag.trim()).filter(Boolean))]);
      await refresh();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save tags.'); }
    finally { setSaving(false); }
  };

  const submitRights = async () => {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      await submitMediaRights(currentUser.employeeId, selected.asset.id, {
        ...rights,
        permittedSocialChannels: rights.permittedSocialChannels.split(',').map(value => value.trim()).filter(Boolean),
        permittedTerritories: rights.permittedTerritories.split(',').map(value => value.trim()).filter(Boolean),
        validFrom: new Date(`${rights.validFrom}T00:00:00.000Z`).toISOString(),
        validUntil: rights.validUntil ? new Date(`${rights.validUntil}T23:59:59.000Z`).toISOString() : '',
      });
      await refresh();
    } catch (rightsError) { setError(rightsError instanceof Error ? rightsError.message : 'Unable to submit rights.'); }
    finally { setSaving(false); }
  };

  const decideRights = async (decision: 'VERIFIED' | 'REJECTED') => {
    if (!selected?.currentRights) return;
    setSaving(true); setError('');
    try { await decideMediaRights(currentUser.employeeId, selected.currentRights.id, decision, decisionReason); await refresh(); }
    catch (decisionError) { setError(decisionError instanceof Error ? decisionError.message : 'Unable to record the decision.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5" data-testid="media-library">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><span className="rounded-lg bg-violet-100 p-2 text-[#7056EE]"><ImageIcon size={20} /></span><h2 className="text-xl font-bold text-slate-900">Secure Media Library</h2></div>
            <p className="mt-2 text-sm text-slate-500">Private, owner-scoped assets. Files remain unusable until validation and rights review pass.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-200 p-2.5 text-slate-600" aria-label="Refresh media"><RefreshCw size={18} /></button>
            <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-2 rounded-lg bg-[#7056EE] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"><UploadCloud size={18} /> Upload media</button>
            <input ref={inputRef} data-testid="media-file-input" className="hidden" type="file" multiple accept={acceptedTypes.join(',')} onChange={event => addFiles(event.target.files)} />
          </div>
        </div>
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}</div>}

      {queue.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="upload-queue">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Upload queue</h3><span className="text-xs text-slate-500">1 MiB resumable chunks</span></div>
        <div className="space-y-3">{queue.map(item => <div key={item.id} data-testid="upload-item" data-filename={item.name} data-status={item.status} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><div className="flex justify-between gap-3 text-sm"><span className="truncate font-medium">{item.name}</span><span className="text-slate-500">{formatBytes(item.size)}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full transition-all ${item.status === 'FAILED' ? 'bg-rose-500' : 'bg-[#7056EE]'}`} style={{ width: `${item.progress}%` }} /></div>
            <div className="mt-1 flex justify-between text-xs"><span className={item.status === 'FAILED' ? 'text-rose-600' : 'text-slate-500'}>{item.error || item.status.toLowerCase().replace('_', ' ')}</span><span>{item.progress}%</span></div></div>
          {item.status === 'UPLOADING' && <button onClick={() => pauseUpload(item.id)} aria-label={`Pause ${item.name}`} className="rounded-lg border p-2"><Pause size={16} /></button>}
          {item.status === 'PAUSED' && <button onClick={() => void uploadOne(item.id)} aria-label={`Resume ${item.name}`} className="rounded-lg border p-2"><Play size={16} /></button>}
          {['QUEUED', 'UPLOADING', 'PAUSED'].includes(item.status) && <button onClick={() => void cancelUpload(item)} aria-label={`Cancel ${item.name}`} className="rounded-lg border p-2 text-rose-600"><X size={16} /></button>}
          {item.status === 'PROCESSING' && <Loader2 className="animate-spin text-[#7056EE]" size={20} />}
          {item.status === 'COMPLETE' && <CheckCircle2 className="text-emerald-600" size={20} />}
          {item.status === 'FAILED' && <XCircle className="text-rose-600" size={20} />}
        </div></div>)}</div>
      </section>}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center">
          <label className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search filename, tag, contributor or rights status" className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm" /></label>
          <select value={category} onChange={event => setCategory(event.target.value as typeof category)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="ALL">All media</option><option value="IMAGE">Photos</option><option value="VIDEO">Videos</option><option value="AUDIO">Audio</option></select>
          <div className="flex rounded-lg border border-slate-200 p-1"><button aria-label="Grid view" onClick={() => setView('GRID')} className={`rounded p-1.5 ${view === 'GRID' ? 'bg-slate-100 text-[#7056EE]' : 'text-slate-400'}`}><Grid2X2 size={17} /></button><button aria-label="List view" onClick={() => setView('LIST')} className={`rounded p-1.5 ${view === 'LIST' ? 'bg-slate-100 text-[#7056EE]' : 'text-slate-400'}`}><List size={17} /></button></div>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading private media…</div> : filtered.length === 0 ? <div className="p-12 text-center"><UploadCloud className="mx-auto text-slate-300" size={36} /><h3 className="mt-3 font-semibold text-slate-800">No media matches this view</h3><p className="mt-1 text-sm text-slate-500">Upload synthetic or approved media to begin. No sample asset is presented as real.</p></div> :
          <div className={view === 'GRID' ? 'grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'divide-y divide-slate-100'}>{filtered.map(item => <button key={item.asset.id} onClick={() => setSelectedId(item.asset.id)} className={view === 'GRID' ? 'overflow-hidden rounded-xl border border-slate-200 text-left transition hover:border-violet-300 hover:shadow-md' : 'flex w-full items-center gap-4 p-4 text-left hover:bg-slate-50'} data-testid={`media-asset-${item.asset.id}`}>
            <div className={view === 'GRID' ? 'relative aspect-video bg-slate-100' : 'relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100'}>{previewUrls[item.asset.id] ? <img src={previewUrls[item.asset.id]} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400">{item.asset.category === 'VIDEO' ? <FileVideo size={32} /> : <ImageIcon size={32} />}</div>} {item.asset.category === 'VIDEO' && <span className="absolute bottom-2 right-2 rounded bg-slate-950/70 p-1 text-white"><Play size={12} /></span>}</div>
            <div className={view === 'GRID' ? 'p-3' : 'min-w-0 flex-1'}><p className="truncate text-sm font-semibold text-slate-900">{item.asset.displayFilename}</p><div className="mt-2 flex flex-wrap gap-1"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(item.asset.lifecycleState)}`}>{item.asset.lifecycleState}</span><span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(item.asset.rightsStatus)}`}>{item.asset.rightsStatus} RIGHTS</span></div><p className="mt-2 text-xs text-slate-500">{item.currentVersion ? formatBytes(item.currentVersion.bytes) : 'Awaiting validated upload'} · {item.asset.tags.length} tags</p></div>
          </button>)}</div>}
      </section>

      {selected && <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]" data-testid="asset-details">
        <div className="space-y-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">{selected.asset.displayFilename}</h3><p className="mt-1 text-xs text-slate-500">Owner {selected.asset.ownerEmployeeId} · Revision {selected.asset.revision}</p></div><button onClick={() => setSelectedId(undefined)} className="rounded-lg border p-2" aria-label="Close asset details"><X size={17} /></button></div>
          <div className="overflow-hidden rounded-xl bg-slate-100 aspect-video">{previewUrls[selected.asset.id] ? <img src={previewUrls[selected.asset.id]} className="h-full w-full object-contain" alt={`Preview of ${selected.asset.displayFilename}`} /> : <div className="flex h-full flex-col items-center justify-center text-slate-400">{selected.asset.category === 'VIDEO' ? <FileVideo size={42} /> : <ImageIcon size={42} />}<span className="mt-2 text-xs">Preview processing unavailable</span></div>}</div>
          <div className="grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Detected media</span><p className="mt-1 font-medium">{selected.currentVersion?.detectedContentType || 'Pending'}</p></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Resolution / duration</span><p className="mt-1 font-medium">{selected.currentVersion?.width && selected.currentVersion?.height ? `${selected.currentVersion.width}×${selected.currentVersion.height}` : 'Not reported'}{selected.currentVersion?.durationMs ? ` · ${(selected.currentVersion.durationMs / 1000).toFixed(1)}s` : ''}</p></div><div className="rounded-xl bg-slate-50 p-3 sm:col-span-2"><span className="text-xs text-slate-500">SHA-256</span><p className="mt-1 break-all font-mono text-xs">{selected.currentVersion?.checksumSha256 || 'Available after reconciliation'}</p></div></div>
          {selected.asset.duplicateOfAssetIds.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertCircle className="mr-2 inline" size={16} />Duplicate bytes match {selected.asset.duplicateOfAssetIds.length} other asset(s). Rights were not copied.</div>}
          <div><label className="mb-1 flex items-center gap-2 text-sm font-semibold"><Tags size={16} /> Tags</label><div className="flex gap-2"><input value={tagText} onChange={event => setTagText(event.target.value)} placeholder="kashmir, winter, hotel" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button disabled={saving} onClick={() => void saveTags()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button></div></div>
        </div>

        <div className="space-y-4 border-t border-slate-200 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><div className="flex items-center gap-2"><ShieldCheck className="text-[#7056EE]" size={20} /><h3 className="font-bold">Rights and consent</h3></div>
          {selected.currentRights ? <div className="rounded-xl border border-slate-200 p-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold">Current submission v{selected.currentRights.revision}</span><span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(selected.currentRights.status)}`}>{selected.currentRights.status}</span></div><dl className="mt-3 space-y-2 text-xs text-slate-600"><div><dt className="font-medium text-slate-800">Source</dt><dd>{selected.currentRights.sourceOrContributor}</dd></div><div><dt className="font-medium text-slate-800">Channels / territories</dt><dd>{selected.currentRights.permittedSocialChannels.join(', ')} · {selected.currentRights.permittedTerritories.join(', ')}</dd></div><div><dt className="font-medium text-slate-800">Commercial advertising</dt><dd>{selected.currentRights.commercialAdvertisingAllowed ? 'Permitted in submitted evidence' : 'Not permitted'}</dd></div>{selected.currentRights.decisionReason && <div><dt className="font-medium text-slate-800">Decision reason</dt><dd>{selected.currentRights.decisionReason}</dd></div>}</dl></div> : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No rights record exists. This asset is not eligible for commercial use.</p>}
          {selected.rightsHistory.length > 1 && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Rights version history ({selected.rightsHistory.length})</summary><ol className="mt-3 space-y-2">{selected.rightsHistory.map((record, index) => <li key={record.id} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2 text-xs"><div><p className="font-medium text-slate-800">Submission {selected.rightsHistory.length - index}: {record.sourceOrContributor}</p><p className="text-slate-500">Immutable ID {record.id} · revision {record.revision}</p></div><span className={`rounded-full border px-2 py-0.5 ${statusTone(record.status)}`}>{record.status}</span></li>)}</ol></details>}

          {selected.currentRights?.status !== 'VERIFIED' && <div className="space-y-3"><input value={rights.sourceOrContributor} onChange={event => setRights(value => ({ ...value, sourceOrContributor: event.target.value }))} placeholder="Source owner or contributor" className="w-full rounded-lg border px-3 py-2 text-sm" /><select value={rights.ownershipBasis} onChange={event => setRights(value => ({ ...value, ownershipBasis: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="BOOKING_BRIDGE_OWNED">Booking Bridge owned</option><option value="LICENSED">Licensed</option><option value="CONTRIBUTOR_PERMISSION">Contributor permission</option><option value="CUSTOMER_CONSENT">Customer consent</option><option value="OTHER">Other documented basis</option></select>
            <div className="grid gap-2 sm:grid-cols-2"><input value={rights.permittedSocialChannels} onChange={event => setRights(value => ({ ...value, permittedSocialChannels: event.target.value }))} placeholder="Permitted channels" className="rounded-lg border px-3 py-2 text-sm" /><input value={rights.permittedTerritories} onChange={event => setRights(value => ({ ...value, permittedTerritories: event.target.value }))} placeholder="Territories" className="rounded-lg border px-3 py-2 text-sm" /><input type="date" value={rights.validFrom} onChange={event => setRights(value => ({ ...value, validFrom: event.target.value }))} className="rounded-lg border px-3 py-2 text-sm" /><input type="date" value={rights.validUntil} onChange={event => setRights(value => ({ ...value, validUntil: event.target.value }))} className="rounded-lg border px-3 py-2 text-sm" /></div>
            <input value={rights.evidenceReference} onChange={event => setRights(value => ({ ...value, evidenceReference: event.target.value }))} placeholder="Evidence reference (agreement/consent ID)" className="w-full rounded-lg border px-3 py-2 text-sm" /><textarea value={rights.influencerRestrictions} onChange={event => setRights(value => ({ ...value, influencerRestrictions: event.target.value }))} placeholder="Influencer or contributor restrictions" className="w-full rounded-lg border px-3 py-2 text-sm" rows={2} /><select value={rights.musicRights} onChange={event => setRights(value => ({ ...value, musicRights: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="NOT_APPLICABLE">No music / not applicable</option><option value="ORIGINAL">Original music</option><option value="LICENSED">Licensed music</option><option value="UNKNOWN">Unknown music rights</option></select>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={rights.subjectConsentRequired} onChange={event => setRights(value => ({ ...value, subjectConsentRequired: event.target.checked }))} className="mt-1" />People shown require consent</label><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={rights.subjectConsentConfirmed} onChange={event => setRights(value => ({ ...value, subjectConsentConfirmed: event.target.checked }))} className="mt-1" />Required guest/influencer consent is documented</label><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={rights.commercialAdvertisingAllowed} onChange={event => setRights(value => ({ ...value, commercialAdvertisingAllowed: event.target.checked }))} className="mt-1" />Evidence explicitly permits commercial advertising</label>
            <button disabled={saving} onClick={() => void submitRights()} className="w-full rounded-lg bg-[#7056EE] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Submit exact rights version for review</button></div>}

          {['Founder', 'Admin'].includes(currentUser.role) && selected.currentRights?.status === 'SUBMITTED' && <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3"><p className="text-sm font-semibold text-violet-900">Founder/Admin review</p><textarea value={decisionReason} onChange={event => setDecisionReason(event.target.value)} placeholder="Required decision reason" className="w-full rounded-lg border border-violet-200 px-3 py-2 text-sm" rows={2} /><div className="grid grid-cols-2 gap-2"><button disabled={saving || !decisionReason.trim()} onClick={() => void decideRights('REJECTED')} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject</button><button disabled={saving || !decisionReason.trim()} onClick={() => void decideRights('VERIFIED')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify rights</button></div></div>}
        </div>
      </section>}
    </div>
  );
};
