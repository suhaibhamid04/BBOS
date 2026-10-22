import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, MapPin, ShieldCheck, Star } from 'lucide-react';
import { APP_CONFIG } from '../../config';
import type { CustomerSharePublicView } from '../../types';
import { openDemoCustomerShare } from '../../services/quote/customerShareDemo';

const money = (value: number, currency: string) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0,
}).format(value);

interface ShareErrorState { code: string; message: string }

function errorCopy(code: string, fallback: string): ShareErrorState {
  if (code === 'CUSTOMER_SHARE_EXPIRED') return { code, message: 'This package link has expired. Please contact Booking Bridge for an updated itinerary.' };
  if (code === 'CUSTOMER_SHARE_REVOKED') return { code, message: 'This package link is no longer available. Please contact Booking Bridge for the latest itinerary.' };
  if (code === 'CUSTOMER_SHARE_NOT_FOUND') return { code, message: 'This package link could not be found.' };
  return { code: code || 'CUSTOMER_SHARE_UNAVAILABLE', message: fallback || 'This package link is temporarily unavailable.' };
}

export const CustomerShareView: React.FC<{ token: string }> = ({ token }) => {
  const [value, setValue] = useState<CustomerSharePublicView | null>(null);
  const [error, setError] = useState<ShareErrorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let next: CustomerSharePublicView;
        if (APP_CONFIG.DEMO_MODE) {
          next = await openDemoCustomerShare(token);
        } else {
          const response = await fetch(`/api/public/quote-shares/${encodeURIComponent(token)}`, {
            headers: { Accept: 'application/json' }, cache: 'no-store',
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            const requestError = new Error(body.error || 'This package link is temporarily unavailable.');
            (requestError as any).code = body.code;
            throw requestError;
          }
          next = body.data as CustomerSharePublicView;
        }
        if (!active) return;
        setValue(next);
        setSelectedKey(next.options.find(option => option.recommended)?.key || next.options[0]?.key || '');
      } catch (requestError: any) {
        if (active) setError(errorCopy(requestError?.code, requestError?.message));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [token]);

  const selected = useMemo(() => value?.options.find(option => option.key === selectedKey) || value?.options[0], [value, selectedKey]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#fffdf8] p-6 text-sm font-semibold text-slate-600">Loading your Booking Bridge package…</div>;
  if (error || !value || !selected) return <main data-testid="customer-share-error" className="flex min-h-screen items-center justify-center bg-[#fffdf8] p-6"><section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><Clock3 className="h-6 w-6 text-slate-600" /></div><h1 className="mt-5 text-xl font-black text-slate-900">Package link unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-600">{error?.message || 'This package link could not be found.'}</p><p className="mt-6 text-xs font-bold uppercase tracking-widest text-[#7056EE]">Booking Bridge</p></section></main>;

  const customerPackage = selected.package;
  return <div data-testid="customer-share-page" className="min-h-screen overflow-x-hidden bg-[#fffdf8] text-slate-900">
    <header className="bg-gradient-to-br from-[#172554] via-[#312e81] to-[#7056EE] px-5 py-8 text-white sm:px-10 sm:py-12">
      <div className="mx-auto max-w-6xl"><p className="text-xs font-black uppercase tracking-[0.28em] text-purple-200">{value.brand.name}</p><p className="mt-1 text-xs text-purple-100">{value.brand.tagline}</p><h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">{value.title}</h1><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-purple-100"><span>Prepared for <strong className="text-white">{value.preparedFor}</strong></span><span><MapPin className="mr-1 inline h-4 w-4" />{value.destination}</span><span>{value.travelerCount} guest{value.travelerCount === 1 ? '' : 's'}</span>{value.travelStartDate && <span>{value.travelStartDate}{value.travelEndDate ? ` → ${value.travelEndDate}` : ''}</span>}</div></div>
    </header>

    <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-8">
      <section aria-labelledby="package-options-title"><div className="mb-5"><h2 id="package-options-title" className="text-2xl font-black">Choose your package</h2><p className="mt-1 text-sm text-slate-500">Compare the options prepared for your trip.</p></div><div className="grid gap-5 lg:grid-cols-3">{value.options.map(option => <article key={option.key} data-testid={`public-option-${option.key}`} className={`relative flex flex-col rounded-3xl border bg-white p-5 shadow-sm ${option.recommended ? 'border-[#7056EE] ring-2 ring-[#7056EE]/20' : 'border-slate-200'}`}>{option.recommended && <span data-testid="public-recommended-badge" className="absolute -top-3 left-5 rounded-full bg-[#7056EE] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white"><Star className="mr-1 inline h-3 w-3 fill-current" />Recommended</span>}<p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-[#7056EE]">{option.label}</p><h3 className="mt-2 text-lg font-bold">{option.customerTitle || `${value.destination} Holiday`}</h3><p data-testid="public-option-price" className="mt-4 text-3xl font-black">{money(option.packageSellingPrice, option.currency)}</p><p className="text-xs text-slate-500">{option.durationDays ? `${option.durationDays} days` : ''}{option.durationNights ? ` / ${option.durationNights} nights` : ''}</p><div className="mt-5 flex-1 space-y-2 text-sm text-slate-700">{[...option.hotelHighlights, ...option.transportHighlights, ...option.includedActivityHighlights].slice(0, 6).map((highlight, index) => <p key={`${highlight}-${index}`}><Check className="mr-2 inline h-4 w-4 text-emerald-600" />{highlight}</p>)}{option.optionalActivityHighlights.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><strong>Optional experiences</strong><br />{option.optionalActivityHighlights.join(', ')}</div>}</div><button type="button" onClick={() => { setSelectedKey(option.key); document.getElementById('package-detail')?.scrollIntoView({ behavior: 'smooth' }); }} className={`mt-5 min-h-11 rounded-xl px-4 py-3 text-sm font-bold ${selected.key === option.key ? 'bg-[#7056EE] text-white' : 'bg-slate-950 text-white'}`}>View complete package</button></article>)}</div></section>

      <article id="package-detail" data-testid="public-package-detail" className="space-y-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
        <section className="grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-wider text-[#7056EE]">{selected.label}</p><h2 className="mt-2 text-2xl font-black">{selected.customerTitle || `${value.destination} Holiday`}</h2><p className="mt-2 text-sm text-slate-600">{customerPackage.travelerCount} guest{customerPackage.travelerCount === 1 ? '' : 's'} · {customerPackage.travelStartDate || 'Dates as per itinerary'}{customerPackage.travelEndDate ? ` → ${customerPackage.travelEndDate}` : ''}</p></div><div className="sm:text-right"><p className="text-xs uppercase text-slate-500">Package selling price</p><p className="text-3xl font-black text-[#7056EE]">{money(customerPackage.packageSellingPrice, customerPackage.currency)}</p></div></section>

        <section><h2 className="text-xl font-black">Day-wise itinerary</h2><div className="mt-4 space-y-4">{customerPackage.itinerary.map(day => <div key={`${day.dayNumber}-${day.date}`} data-testid="public-itinerary-day" className="rounded-2xl border border-slate-200 p-4"><p className="font-bold">Day {day.dayNumber}: {day.title}</p><p className="text-xs text-slate-500">{day.date}{day.location ? ` · ${day.location}` : ''}</p>{day.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{day.description}</p>}<div className="mt-3 space-y-2">{day.items.map((item, index) => <div key={`${item.title}-${index}`} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.title}</strong>{item.inclusionStatus === 'OPTIONAL' && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">Optional experience</span>}{item.inclusionStatus === 'NOT_INCLUDED' && <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-bold">Not included</span>}</div>{item.description && <p className="mt-1 text-xs text-slate-600">{item.description}</p>}{item.type === 'HOTEL' && <p className="mt-1 text-xs text-slate-600">{item.propertyName} · {item.roomCategoryName} · {item.mealPlan}</p>}</div>)}</div></div>)}</div></section>

        <section className="grid gap-5 sm:grid-cols-3"><div><h2 className="font-black">Hotels</h2>{customerPackage.hotels.map((hotel, index) => <p key={`${hotel.hotelName}-${index}`} className="mt-2 text-sm text-slate-600">{hotel.hotelName}<br />{hotel.roomCategoryName} · {hotel.mealPlan}</p>)}</div><div><h2 className="font-black">Transport</h2>{customerPackage.transports.map((transport, index) => <p key={`${transport.vehicleName}-${index}`} className="mt-2 text-sm text-slate-600">{transport.vehicleName}<br />{transport.route}</p>)}</div><div><h2 className="font-black">Activities</h2>{customerPackage.activities.map((activity, index) => <p key={`${activity.activityName}-${index}`} className="mt-2 text-sm text-slate-600">{activity.activityName}{activity.inclusionStatus === 'OPTIONAL' ? ' · Optional' : activity.inclusionStatus === 'NOT_INCLUDED' ? ' · Not included' : ''}</p>)}</div></section>
        <section className="grid gap-6 sm:grid-cols-2"><div><h2 className="font-black">Inclusions</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">{customerPackage.inclusions.map(item => <li key={item}>{item}</li>)}</ul></div><div><h2 className="font-black">Exclusions</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">{customerPackage.exclusions.map(item => <li key={item}>{item}</li>)}</ul></div></section>
        {customerPackage.paymentSchedule?.length ? <section><h2 className="font-black">Payment schedule</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">{customerPackage.paymentSchedule.map((item, index) => <li key={`${item.timing}-${index}`}>{item.percentage}% · {item.label}{item.dueDate ? ` · ${item.dueDate}` : ''}</li>)}</ul></section> : null}
        {customerPackage.termsAndConditions && <section><h2 className="font-black">Terms & cancellation information</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{customerPackage.termsAndConditions}</p></section>}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500"><span>{value.brand.email} · {value.brand.phone}</span><span><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-600" />Secure Booking Bridge package</span></footer>
      </article>
    </main>
  </div>;
};
