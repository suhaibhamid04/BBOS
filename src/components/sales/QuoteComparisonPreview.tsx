import React from 'react';
import { Check, ChevronRight, Star, X } from 'lucide-react';
import type { CustomerQuoteComparison } from '../../types';

const money = (value: number, currency: string) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0,
}).format(value);

export const QuoteComparisonPreview: React.FC<{
  value: CustomerQuoteComparison;
  onClose: () => void;
  onOpenOption: (quoteId: string) => void;
}> = ({ value, onClose, onOpenOption }) => (
  <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-3 sm:p-6" data-testid="quote-comparison-preview">
    <main className="mx-auto min-h-full max-w-6xl overflow-hidden rounded-3xl bg-[#fffdf8] shadow-2xl">
      <header className="relative bg-gradient-to-br from-[#172554] via-[#312e81] to-[#7056EE] px-5 py-8 text-white sm:px-10 sm:py-12">
        <button type="button" onClick={onClose} aria-label="Close comparison" className="absolute right-4 top-4 rounded-full bg-white/15 p-2"><X className="h-5 w-5" /></button>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-purple-200">Booking Bridge</p>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">Choose the package that suits you best</h1>
        <p className="mt-3 text-sm text-purple-100">{value.title} · {value.customerName}</p>
      </header>
      <section className="grid gap-5 p-4 sm:p-8 lg:grid-cols-3">
        {value.options.map(option => (
          <article key={option.optionId} data-testid={`customer-option-${option.optionId}`} className={`relative flex flex-col rounded-3xl border bg-white p-5 shadow-sm ${option.recommended ? 'border-[#7056EE] ring-2 ring-[#7056EE]/20' : 'border-slate-200'}`}>
            {option.recommended && <div data-testid="recommended-option-badge" className="absolute -top-3 left-5 rounded-full bg-[#7056EE] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white"><Star className="mr-1 inline h-3 w-3 fill-current" />Recommended</div>}
            <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-[#7056EE]">{option.label}</p>
            <h2 className="mt-2 text-lg font-bold text-slate-900">{option.customerTitle || `${value.destination} Holiday`}</h2>
            <p data-testid="customer-option-price" className="mt-4 text-3xl font-black text-slate-950">{money(option.packageSellingPrice, option.currency)}</p>
            <p className="text-xs text-slate-500">for {option.travelerCount} guest{option.travelerCount === 1 ? '' : 's'}{option.durationDays ? ` · ${option.durationDays} days` : ''}{option.durationNights ? ` / ${option.durationNights} nights` : ''}</p>
            <div className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
              {[...option.hotelHighlights, ...option.transportHighlights, ...option.includedActivityHighlights].slice(0, 6).map((highlight, index) => <p key={`${highlight}-${index}`}><Check className="mr-2 inline h-4 w-4 text-emerald-600" />{highlight}</p>)}
              {option.optionalActivityHighlights.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><strong>Optional experiences</strong><br />{option.optionalActivityHighlights.join(', ')} — available at additional cost</div>}
            </div>
            <p className="mt-5 text-[11px] text-slate-500">Valid until {new Date(`${option.validUntil}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
            <button type="button" data-testid={`view-option-${option.optionId}`} onClick={() => onOpenOption(option.quoteId)} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">View complete package <ChevronRight className="inline h-4 w-4" /></button>
          </article>
        ))}
      </section>
      <footer className="px-6 pb-8 text-center text-xs text-slate-500">Package prices include only the services marked as included. Optional experiences are quoted separately.</footer>
    </main>
  </div>
);
