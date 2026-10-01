import React from 'react';
import { Download, Printer, Share2, X } from 'lucide-react';
import type { CustomerPackageDocument } from '../../types';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export function buildCustomerPackageHtml(value: CustomerPackageDocument): string {
  const serviceRows = value.itinerary.flatMap(day => day.items.map(item =>
    `<li><strong>Day ${day.dayNumber} · ${escapeHtml(item.title)}</strong>${item.description ? ` — ${escapeHtml(item.description)}` : ''}</li>`
  )).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(value.packageReference)}</title><style>body{font:14px Arial,sans-serif;color:#172033;max-width:820px;margin:32px auto;line-height:1.5}h1,h2{color:#4f35c7}.price{font-size:22px;font-weight:700}.card{border:1px solid #dce1ea;border-radius:12px;padding:16px;margin:12px 0}small{color:#64748b}</style></head><body><h1>${escapeHtml(value.brand.name)}</h1><p>${escapeHtml(value.brand.tagline)}</p><div class="card"><h2>${escapeHtml(value.destination)} package</h2><p>Prepared for <strong>${escapeHtml(value.customerName)}</strong></p><p>${escapeHtml(value.travelStartDate || '')}${value.travelEndDate ? ` to ${escapeHtml(value.travelEndDate)}` : ''} · ${value.travelerCount} traveler(s)</p><p class="price">${escapeHtml(money(value.packageSellingPrice, value.currency))}</p></div><h2>Itinerary</h2><ol>${serviceRows}</ol><h2>Inclusions</h2><ul>${value.inclusions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><h2>Exclusions</h2><ul>${value.exclusions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>${value.termsAndConditions ? `<h2>Terms</h2><p>${escapeHtml(value.termsAndConditions)}</p>` : ''}<hr><small>${escapeHtml(value.brand.email)} · ${escapeHtml(value.brand.phone)} · Reference ${escapeHtml(value.packageReference)}</small></body></html>`;
}

function downloadDocument(value: CustomerPackageDocument) {
  const blob = new Blob([buildCustomerPackageHtml(value)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${value.packageReference}-customer-package.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const CustomerPackagePreview: React.FC<{
  value: CustomerPackageDocument;
  onClose: () => void;
  onShare: () => void | Promise<void>;
  isSharing: boolean;
  error?: string | null;
}> = ({ value, onClose, onShare, isSharing, error }) => (
  <div className="fixed inset-0 z-[70] overflow-auto bg-slate-950/70 p-4 print:static print:bg-white print:p-0">
    <div data-testid="customer-package-preview" className="mx-auto max-w-4xl rounded-2xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-slate-200 bg-white p-4 print:hidden">
        <div><p className="font-bold text-slate-900">Customer package preview</p><p className="text-xs text-slate-500">Customer-safe document · {value.packageReference}</p></div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="download-customer-package" type="button" onClick={() => downloadDocument(value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"><Download className="mr-1 inline h-4 w-4" />Download document</button>
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"><Printer className="mr-1 inline h-4 w-4" />Print / Save PDF</button>
          <button data-testid="share-customer-package" type="button" disabled={isSharing} onClick={() => void (async () => { try { await onShare(); downloadDocument(value); } catch { /* Parent renders the authoritative API error. */ } })()} className="rounded-lg bg-[#7056EE] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Share2 className="mr-1 inline h-4 w-4" />{isSharing ? 'Recording share…' : 'Share Package'}</button>
          <button type="button" onClick={onClose} aria-label="Close customer package" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
      </div>
      {error && <div role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 print:hidden">{error}</div>}
      <article className="space-y-7 p-8 text-slate-800 sm:p-12">
        <header className="border-b-2 border-[#7056EE] pb-5">
          <p className="text-2xl font-black text-[#7056EE]">{value.brand.name}</p>
          <p className="text-xs text-slate-500">{value.brand.tagline}</p>
        </header>
        <section className="grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
          <div><p className="text-xs uppercase text-slate-500">Prepared for</p><p data-testid="customer-package-name" className="text-lg font-bold">{value.customerName}</p><p className="text-sm">{value.destination} · {value.travelerCount} traveler(s)</p></div>
          <div className="sm:text-right"><p className="text-xs uppercase text-slate-500">Package Selling Price</p><p data-testid="customer-package-price" className="text-2xl font-black text-[#7056EE]">{money(value.packageSellingPrice, value.currency)}</p><p className="text-xs text-slate-500">{value.travelStartDate || 'Dates as per itinerary'}{value.travelEndDate ? ` → ${value.travelEndDate}` : ''}</p></div>
        </section>
        <section><h2 className="mb-3 text-lg font-bold">Day-wise itinerary</h2><div className="space-y-3">{value.itinerary.map(day => <div key={`${day.dayNumber}-${day.date}`} className="rounded-xl border border-slate-200 p-4"><p className="font-bold">Day {day.dayNumber}: {day.title}</p><p className="text-xs text-slate-500">{day.date}{day.location ? ` · ${day.location}` : ''}</p><div className="mt-3 space-y-2">{day.items.map((item, index) => <div key={`${item.title}-${index}`} data-testid={`customer-package-${item.type.toLowerCase()}`} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">{item.title}</p><p className="text-xs text-slate-600">{item.description}</p>{item.type === 'HOTEL' && <p className="text-xs text-slate-600">{item.propertyName} · {item.roomCategoryName} · {item.mealPlan}</p>}</div>)}</div></div>)}</div></section>
        <section className="grid gap-5 sm:grid-cols-2"><div><h2 className="font-bold">Inclusions</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{value.inclusions.map(item => <li key={item}>{item}</li>)}</ul></div><div><h2 className="font-bold">Exclusions</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{value.exclusions.map(item => <li key={item}>{item}</li>)}</ul></div></section>
        {value.termsAndConditions && <section><h2 className="font-bold">Terms & policies</h2><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{value.termsAndConditions}</p></section>}
        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">{value.brand.email} · {value.brand.phone} · Reference {value.packageReference}</footer>
      </article>
    </div>
  </div>
);
