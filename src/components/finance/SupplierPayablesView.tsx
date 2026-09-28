import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, RefreshCw, WalletCards, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getSupplierPayable,
  listSupplierPayables,
  recordSupplierPayment,
  rejectSupplierPayment,
  verifySupplierPayment,
  voidSupplierPayment,
} from '../../services/supplierPayables/supplierPayableApi';
import type {
  RecordSupplierPaymentInput,
  SupplierPayable,
  SupplierPayableOperationalView,
  SupplierPayableSummary,
  SupplierPaymentRecord,
} from '../../types/supplierPayable';

const EMPTY_PAYMENT: RecordSupplierPaymentInput = {
  amount: 0,
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'BANK_TRANSFER',
  referenceNumber: '',
  paymentType: 'ADVANCE',
  notes: '',
};

function money(minor: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
}

function statusClass(status: string) {
  if (status === 'SETTLED' || status === 'VERIFIED') return 'bg-emerald-50 text-emerald-700';
  if (status === 'PARTIALLY_PAID' || status === 'RECORDED') return 'bg-amber-50 text-amber-700';
  if (status === 'OVERPAID' || status === 'PENDING_APPROVAL') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

export const SupplierPayablesView: React.FC = () => {
  const { currentUser } = useAuth();
  const [obligations, setObligations] = useState<Array<SupplierPayable | SupplierPayableOperationalView>>([]);
  const [summaries, setSummaries] = useState<SupplierPayableSummary[]>([]);
  const [selected, setSelected] = useState<SupplierPayable | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [paymentForm, setPaymentForm] = useState<RecordSupplierPaymentInput>(EMPTY_PAYMENT);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listSupplierPayables(currentUser.employeeId);
      setObligations(result.obligations);
      setSummaries(result.summaries || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load supplier dues.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [currentUser.employeeId]);

  const visible = useMemo(() => obligations.filter((item) => {
    const matchesStatus = status === 'ALL' || item.settlementStatus === status;
    const normalized = query.trim().toLowerCase();
    const matchesQuery = !normalized || [item.supplierName, item.bookingReference, item.serviceName]
      .some((value) => value.toLowerCase().includes(normalized));
    return matchesStatus && matchesQuery;
  }), [obligations, query, status]);

  const updateSelected = (next: SupplierPayable) => {
    setSelected(next);
    setObligations((current) => current.map((item) =>
      item.obligationId === next.obligationId ? next : item
    ));
  };

  const openDetail = async (item: SupplierPayable | SupplierPayableOperationalView) => {
    setError('');
    try {
      setSelected(await getSupplierPayable(item.bookingId, item.obligationId, currentUser.employeeId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load supplier obligation.');
    }
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const result = await recordSupplierPayment(
        selected.bookingId, selected.obligationId, paymentForm, currentUser.employeeId,
      );
      updateSelected(result.obligation);
      setPaymentForm(EMPTY_PAYMENT);
      setNotice('Supplier payment recorded and awaiting verification.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to record supplier payment.');
    } finally {
      setSaving(false);
    }
  };

  const paymentAction = async (payment: SupplierPaymentRecord, action: 'verify' | 'reject' | 'void') => {
    if (!selected) return;
    const reason = action === 'verify'
      ? ''
      : window.prompt(`${action === 'reject' ? 'Rejection' : 'Void'} reason (minimum 5 characters):`) || '';
    if (action !== 'verify' && reason.length < 5) return;
    setError('');
    try {
      const result = action === 'verify'
        ? await verifySupplierPayment(selected, payment.id, currentUser.employeeId)
        : action === 'reject'
          ? await rejectSupplierPayment(selected, payment.id, reason, currentUser.employeeId)
          : await voidSupplierPayment(selected, payment.id, reason, currentUser.employeeId);
      updateSelected(result.obligation);
      setNotice(`Supplier payment ${action} action completed.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to ${action} supplier payment.`);
    }
  };

  const summary = summaries[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#7056EE]">Accounts</p>
          <h2 className="text-xl font-bold text-slate-900">Supplier Dues &amp; Settlements</h2>
          <p className="text-xs text-slate-500 mt-1">Liabilities are derived from immutable Booking financial snapshots.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-bold text-slate-600">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800">{error}</div>}
      {notice && <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-800">{notice}</div>}

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Frozen liability', money(summary.totalFrozenLiabilityMinor, summary.currency)],
            ['Verified paid', money(summary.totalVerifiedPaidMinor, summary.currency)],
            ['Outstanding', money(summary.totalOutstandingMinor, summary.currency)],
            ['Disputed / pending', String(summary.disputedCount)],
          ].map(([label, value]) => <div key={label} className="bg-white border rounded-xl p-4"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-900">{value}</div></div>)}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search supplier, Booking, or service" className="flex-1 px-3 py-2 border rounded-lg text-xs" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="px-3 py-2 border rounded-lg text-xs bg-white">
          {['ALL', 'UNPAID', 'PARTIALLY_PAID', 'SETTLED', 'OVERPAID', 'PENDING_APPROVAL'].map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>

      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Supplier / service</th><th className="p-3">Booking</th><th className="p-3">Service date</th><th className="p-3">Frozen</th><th className="p-3">Paid</th><th className="p-3">Outstanding</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody className="divide-y">
            {loading ? <tr><td colSpan={8} className="p-10 text-center text-slate-500">Loading supplier dues...</td></tr>
              : visible.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-slate-500">No supplier obligations found.</td></tr>
                : visible.map((item) => {
                  const financial = item as SupplierPayable;
                  return <tr key={item.obligationId} className="hover:bg-slate-50"><td className="p-3"><div className="font-bold text-slate-900">{item.supplierName}</div><div className="text-slate-500">{item.serviceName} · {item.serviceType}</div></td><td className="p-3 font-mono">{item.bookingReference}</td><td className="p-3">{item.serviceStartDate || '-'}</td><td className="p-3">{'frozenLiabilityMinor' in financial ? money(financial.frozenLiabilityMinor, financial.currency) : 'Restricted'}</td><td className="p-3 text-emerald-700">{'verifiedPaidMinor' in financial ? money(financial.verifiedPaidMinor, financial.currency) : 'Restricted'}</td><td className="p-3 font-bold">{'outstandingMinor' in financial ? money(financial.outstandingMinor, financial.currency) : 'Restricted'}</td><td className="p-3"><span className={`px-2 py-1 rounded-full font-bold ${statusClass(item.settlementStatus)}`}>{item.settlementStatus}</span>{item.requiresCommercialApproval && <div className="mt-1 text-[10px] text-rose-700">Commercial approval required</div>}</td><td className="p-3"><button type="button" onClick={() => void openDetail(item)} className="p-2 text-[#7056EE] hover:bg-purple-50 rounded-lg"><Eye className="w-4 h-4" /></button></td></tr>;
                })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b flex justify-between"><div><h3 className="font-bold text-slate-900">{selected.supplierName}</h3><p className="text-xs text-slate-500">{selected.bookingReference} · {selected.serviceName}</p></div><button type="button" onClick={() => setSelected(null)}><X className="w-4 h-4" /></button></div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[
                ['Frozen liability', money(selected.frozenLiabilityMinor, selected.currency)],
                ['Verified paid', money(selected.verifiedPaidMinor, selected.currency)],
                ['Outstanding', money(selected.outstandingMinor, selected.currency)],
                ['Status', selected.settlementStatus],
              ].map(([label, value]) => <div key={label} className="p-3 bg-slate-50 border rounded-xl"><div className="text-[10px] text-slate-500">{label}</div><div className="font-bold text-slate-900 mt-1">{value}</div></div>)}</div>

              {selected.rateDiscrepancy && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs"><div className="flex gap-2 font-bold text-rose-800"><AlertTriangle className="w-4 h-4" /> Rate discrepancy pending commercial approval</div><p className="mt-1 text-rose-700">{selected.rateDiscrepancy.reason}. The frozen liability remains authoritative.</p></div>}

              <form onSubmit={submitPayment} className="p-4 border rounded-xl space-y-3">
                <div className="font-bold text-sm flex items-center gap-2"><WalletCards className="w-4 h-4" /> Record supplier payment</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <label>Amount<input required min="0.01" step="0.01" type="number" value={paymentForm.amount || ''} onChange={(event) => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })} className="block mt-1 w-full px-3 py-2 border rounded-lg" /></label>
                  <label>Payment date<input required type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} className="block mt-1 w-full px-3 py-2 border rounded-lg" /></label>
                  <label>Type<select value={paymentForm.paymentType} onChange={(event) => setPaymentForm({ ...paymentForm, paymentType: event.target.value as any })} className="block mt-1 w-full px-3 py-2 border rounded-lg bg-white"><option>ADVANCE</option><option>PARTIAL</option><option>FINAL_SETTLEMENT</option></select></label>
                  <label>Method<select value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value as any })} className="block mt-1 w-full px-3 py-2 border rounded-lg bg-white"><option>BANK_TRANSFER</option><option>UPI</option><option>CHEQUE</option><option>CASH</option><option>OTHER</option></select></label>
                  <label className="md:col-span-2">Transaction reference<input required value={paymentForm.referenceNumber} onChange={(event) => setPaymentForm({ ...paymentForm, referenceNumber: event.target.value })} className="block mt-1 w-full px-3 py-2 border rounded-lg" /></label>
                </div>
                <button disabled={saving || !selected.canRecordPayment} className="px-4 py-2 bg-[#7056EE] text-white rounded-lg text-xs font-bold disabled:opacity-50">{saving ? 'Recording...' : 'Record payment'}</button>
              </form>

              <div><h4 className="font-bold text-sm mb-2">Payment history</h4><div className="space-y-2">{!selected.payments?.length ? <div className="text-xs text-slate-500">No supplier payments recorded.</div> : selected.payments.map((payment) => <div key={payment.id} className="p-3 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{money(payment.amountMinor, payment.currency)} · {payment.paymentType}</div><div className="text-[11px] text-slate-500">{payment.paymentDate} · {payment.paymentMethod} · {payment.referenceNumber}</div><div className="text-[10px] text-slate-400">Recorded by {payment.recordedByName}</div></div><div className="flex items-center gap-2"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${statusClass(payment.status)}`}>{payment.status}</span>{payment.status === 'RECORDED' && <><button type="button" onClick={() => void paymentAction(payment, 'verify')} className="p-2 text-emerald-700" title="Verify"><CheckCircle2 className="w-4 h-4" /></button><button type="button" onClick={() => void paymentAction(payment, 'reject')} className="px-2 py-1 text-rose-700 text-[10px] font-bold">Reject</button></>}{payment.status === 'VERIFIED' && (currentUser.role === 'Founder' || currentUser.role === 'Admin') && <button type="button" onClick={() => void paymentAction(payment, 'void')} className="px-2 py-1 text-rose-700 text-[10px] font-bold">Void</button>}</div></div>)}</div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
