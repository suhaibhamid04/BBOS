import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  adjustCommission,
  applyAmendment,
  applySubstitution,
  calculateRefund,
  decideAmendment,
  decideRefund,
  decideSubstitution,
  getFinancialExceptionOverview,
  markRefundPaid,
  proposeAmendment,
  proposeSubstitution,
  settleCommission,
  submitRefund,
  type FinancialExceptionOverview,
} from '../../services/booking/financialExceptionApi';

interface Props {
  bookingId: string;
  bookingStatus: string;
  salesOwnerEmployeeId?: string;
}

const control = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800';
const primary = 'rounded-lg bg-[#7056EE] px-3 py-2 text-xs font-bold text-white disabled:opacity-50';
const secondary = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50';
const danger = 'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50';

function money(value: number | undefined, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
}

export const FinancialExceptionsPanel: React.FC<Props> = ({ bookingId, bookingStatus, salesOwnerEmployeeId }) => {
  const { currentUser } = useAuth();
  const [overview, setOverview] = useState<FinancialExceptionOverview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [amendmentReason, setAmendmentReason] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [substitution, setSubstitution] = useState({ serviceType: 'ACCOMMODATION', serviceId: '', ratePeriodId: '', reason: '' });
  const [refundReason, setRefundReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('BANK_TRANSFER');
  const [refundReference, setRefundReference] = useState('');
  const [commissionAmount, setCommissionAmount] = useState('');
  const [commissionReason, setCommissionReason] = useState('');
  const [settlementReference, setSettlementReference] = useState('');

  const roles = useMemo(() => ({
    all: ['Founder', 'Admin'].includes(currentUser.role),
    sales: ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'].includes(currentUser.role),
    salesApproval: ['Founder', 'Admin', 'Sales Manager'].includes(currentUser.role),
    reservations: ['Founder', 'Admin', 'Reservations'].includes(currentUser.role),
    finance: ['Founder', 'Admin', 'Accounts'].includes(currentUser.role),
    accounts: currentUser.role === 'Accounts',
  }), [currentUser.role]);

  const load = useCallback(async () => {
    setBusy('load'); setError('');
    try { setOverview(await getFinancialExceptionOverview(bookingId, currentUser.employeeId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load financial workflows.'); }
    finally { setBusy(''); }
  }, [bookingId, currentUser.employeeId]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key); setError('');
    try { await action(); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Workflow action failed.'); setBusy(''); }
  };

  if (!overview && busy === 'load') return <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-500">Loading financial workflows…</div>;
  if (!overview) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">{error || 'Financial workflows unavailable.'}</div>;

  return (
    <section data-testid="financial-exceptions-panel" className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Financial & commercial exceptions</h3>
          <p className="text-[11px] text-slate-500">Approval and application/payment are separate audited steps.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={!!busy} className={secondary} aria-label="Refresh financial workflows">
          <RefreshCw className={`h-3.5 w-3.5 ${busy === 'load' ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <div role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertTriangle className="h-4 w-4" />{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="amendment-workflow">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Amendments</h4>
        {roles.sales && ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING'].includes(bookingStatus) && (
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <input className={control} value={amendmentReason} onChange={event => setAmendmentReason(event.target.value)} placeholder="Reason for change" />
            <input className={control} type="number" min="0" step="0.01" value={sellingPrice} onChange={event => setSellingPrice(event.target.value)} placeholder="New selling price" />
            <button className={primary} disabled={!!busy || amendmentReason.trim().length < 5 || !sellingPrice} onClick={() => void run('amendment-new', async () => {
              await proposeAmendment(bookingId, { reason: amendmentReason, proposedSellingPrice: Number(sellingPrice) }, currentUser.employeeId);
              setAmendmentReason(''); setSellingPrice('');
            })}>{busy === 'amendment-new' ? 'Submitting…' : 'Propose'}</button>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {overview.amendments.map(item => <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>Version {item.version} · {item.status}</strong><span>{money(item.proposed.sellingPrice, item.proposed.currency)}</span></div>
            <p className="mt-1 text-slate-600">{item.reason}</p>
            <p className="mt-1 text-[11px] text-slate-500">Selling price {money(item.before.sellingPrice, item.before.currency)} → {money(item.proposed.sellingPrice, item.proposed.currency)} · profit {money(item.before.profit, item.before.currency)} → {money(item.proposed.profit, item.proposed.currency)} · margin {item.before.margin.toFixed(2)}% → {item.proposed.margin.toFixed(2)}%</p>
            <p className="mt-1 text-[11px] text-slate-500">Supplier cost {money(item.before.supplierCost, item.before.currency)} → {money(item.proposed.supplierCost, item.proposed.currency)} · guests {item.before.guestCount} → {item.proposed.guestCount} · {item.before.travelStartDate}–{item.before.travelEndDate} → {item.proposed.travelStartDate}–{item.proposed.travelEndDate}</p>
            {item.rejectionReason && <p className="mt-1 text-[11px] font-semibold text-rose-700">Rejected: {item.rejectionReason}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {roles.salesApproval && item.status === 'PENDING_APPROVAL' && item.proposedByEmployeeId !== currentUser.employeeId && <>
                <button className={primary} disabled={!!busy} onClick={() => void run(item.id, () => decideAmendment(item.id, { decision: 'APPROVED', decisionNote: 'Approved after commercial review.' }, currentUser.employeeId))}>Approve</button>
                <button className={danger} disabled={!!busy} onClick={() => void run(item.id, () => decideAmendment(item.id, { decision: 'REJECTED', rejectionReason: 'Rejected after commercial review.' }, currentUser.employeeId))}>Reject</button>
              </>}
              {roles.salesApproval && item.status === 'APPROVED' && <button className={primary} disabled={!!busy} onClick={() => void run(item.id, () => applyAmendment(item.id, currentUser.employeeId))}>Apply approved version</button>}
            </div>
          </div>)}
          {!overview.amendments.length && <p className="text-xs text-slate-400">No amendments.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="substitution-workflow">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Supplier substitutions</h4>
        {roles.reservations && ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING'].includes(bookingStatus) && <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <select className={control} value={substitution.serviceType} onChange={event => setSubstitution(value => ({ ...value, serviceType: event.target.value }))}><option>ACCOMMODATION</option><option>TRANSPORT</option><option>ACTIVITY</option></select>
          <input className={control} value={substitution.serviceId} onChange={event => setSubstitution(value => ({ ...value, serviceId: event.target.value }))} placeholder="Booked service ID" />
          <input className={control} value={substitution.ratePeriodId} onChange={event => setSubstitution(value => ({ ...value, ratePeriodId: event.target.value }))} placeholder="Replacement rate period ID" />
          <input className={control} value={substitution.reason} onChange={event => setSubstitution(value => ({ ...value, reason: event.target.value }))} placeholder="Substitution reason" />
          <button className={primary} disabled={!!busy || !substitution.serviceId || !substitution.ratePeriodId || substitution.reason.trim().length < 5} onClick={() => void run('substitution-new', async () => {
            await proposeSubstitution(bookingId, substitution, currentUser.employeeId);
            setSubstitution(value => ({ ...value, serviceId: '', ratePeriodId: '', reason: '' }));
          })}>Propose substitution</button>
        </div>}
        <div className="mt-3 space-y-2">{overview.substitutions.map(item => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2"><strong>{item.serviceType} · {item.status}</strong><span>{item.original.label} → {item.replacement.label}</span></div>
          <p className="mt-1 text-[11px] text-slate-500">Cost Δ {money(item.supplierCostDifference)} ({Number(item.costIncreasePercent || 0).toFixed(2)}%) · {item.requiresAdminApproval ? `Admin approval required: ${(item.materialReasons || []).join(', ') || 'material policy difference'}` : 'Equivalent service within 5% policy'}</p>
          {item.rejectionReason && <p className="mt-1 text-[11px] font-semibold text-rose-700">Rejected: {item.rejectionReason}</p>}
          <div className="mt-2 flex gap-2">{roles.all && item.status === 'PENDING_APPROVAL' && <><button className={primary} onClick={() => void run(item.id, () => decideSubstitution(item.id, { decision: 'APPROVED', decisionNote: 'Approved material substitution.' }, currentUser.employeeId))}>Approve</button><button className={danger} onClick={() => void run(item.id, () => decideSubstitution(item.id, { decision: 'REJECTED', rejectionReason: 'Rejected material substitution.' }, currentUser.employeeId))}>Reject</button></>}{roles.reservations && item.status === 'APPROVED' && <button className={primary} onClick={() => void run(item.id, () => applySubstitution(item.id, currentUser.employeeId))}>Apply</button>}</div>
        </div>)}</div>
      </div>

      {roles.finance && <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="refund-workflow">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Cancellation refunds</h4>
        {bookingStatus === 'CANCELLED' && <div className="mt-2 flex gap-2"><input className={control} value={refundReason} onChange={event => setRefundReason(event.target.value)} placeholder="Refund calculation reason" /><button className={primary} disabled={!!busy || refundReason.trim().length < 5} onClick={() => void run('refund-new', async () => { await calculateRefund(bookingId, { reason: refundReason }, currentUser.employeeId); setRefundReason(''); })}>Calculate</button></div>}
        <div className="mt-3 space-y-2">{overview.refunds.map(item => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-xs">
          <div className="flex justify-between gap-2"><strong>{item.status}</strong><span>Suggested {money(item.calculation.suggestedRefundAmount, item.currency)}</span></div>
          <p className="mt-1 text-[11px] text-slate-500">Received {money(item.calculation.verifiedPaymentsReceived, item.currency)} · standard {Number(item.calculation.cancellationPercentage || 0)}% charge {money(item.calculation.standardCancellationCharge || 0, item.currency)} · net supplier exposure {money(item.calculation.netSupplierExposure ?? item.calculation.supplierDeductions, item.currency)} · applicable charge {money(item.calculation.applicableCancellationCharge ?? item.calculation.bookingBridgeDeductions, item.currency)}</p>
          {item.rejectionReason && <p className="mt-1 text-[11px] font-semibold text-rose-700">Rejected: {item.rejectionReason}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {item.status === 'CALCULATED' && <button className={primary} onClick={() => void run(item.id, () => submitRefund(item.id, currentUser.employeeId))}>Submit for approval</button>}
            {roles.all && item.status === 'PENDING_APPROVAL' && item.requestedByEmployeeId !== currentUser.employeeId && <><button className={primary} onClick={() => void run(item.id, () => decideRefund(item.id, { decision: 'APPROVED', approvedAmount: item.requestedAmount, decisionNote: 'Approved against calculated evidence.' }, currentUser.employeeId))}>Approve</button><button className={danger} onClick={() => void run(item.id, () => decideRefund(item.id, { decision: 'REJECTED', rejectionReason: 'Rejected after refund review.' }, currentUser.employeeId))}>Reject</button></>}
            {roles.accounts && item.status === 'APPROVED' && item.requestedByEmployeeId !== currentUser.employeeId && item.approvedByEmployeeId !== currentUser.employeeId && <div className="grid w-full gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className={control} value={refundMethod} onChange={event => setRefundMethod(event.target.value)} placeholder="Refund method" /><input className={control} value={refundReference} onChange={event => setRefundReference(event.target.value)} placeholder="Bank/payment reference" /><button className={primary} disabled={refundReference.trim().length < 3} onClick={() => void run(item.id, () => markRefundPaid(item.id, { refundMethod, refundReference }, currentUser.employeeId))}>Record paid</button></div>}
          </div>
        </div>)}</div>
      </div>}

      {overview.commissions.length > 0 || roles.finance ? <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="commission-workflow">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Sales commission ledger</h4>
        <p className="mt-1 text-[11px] text-slate-500">Earned {money(overview.commissions.filter(item => item.type === 'EARNED').reduce((sum, item) => sum + item.amount, 0))} · reversed {money(overview.commissions.filter(item => item.type === 'REVERSAL').reduce((sum, item) => sum + item.amount, 0))} · settled {money(overview.commissions.filter(item => item.type === 'SETTLED').reduce((sum, item) => sum + item.amount, 0))}</p>
        <div className="mt-2 flex flex-wrap gap-2">{overview.commissions.map(item => <span key={item.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{item.type} · {money(item.amount, item.currency)} · {item.employeeId}</span>)}</div>
        {roles.all && <div className="mt-3 grid gap-2 sm:grid-cols-[100px_1fr_auto]"><input className={control} type="number" step="0.01" value={commissionAmount} onChange={event => setCommissionAmount(event.target.value)} placeholder="Amount" /><input className={control} value={commissionReason} onChange={event => setCommissionReason(event.target.value)} placeholder="Adjustment reason" /><button className={secondary} disabled={!commissionAmount || commissionReason.trim().length < 5} onClick={() => void run('commission-adjust', () => adjustCommission(bookingId, { amount: Number(commissionAmount), reason: commissionReason, idempotencyKey: `${bookingId}-${Date.now()}` }, currentUser.employeeId))}>Adjust</button></div>}
        {roles.finance && salesOwnerEmployeeId && <div className="mt-2 flex gap-2"><input className={control} value={settlementReference} onChange={event => setSettlementReference(event.target.value)} placeholder="Commission settlement reference" /><button className={secondary} disabled={settlementReference.trim().length < 3} onClick={() => void run('commission-settle', () => settleCommission(salesOwnerEmployeeId, { settlementReference, idempotencyKey: `${salesOwnerEmployeeId}-${settlementReference}`, reason: 'Explicit commission settlement.' }, currentUser.employeeId))}>Settle outstanding</button></div>}
      </div> : null}

      {busy && busy !== 'load' && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Applying server-authoritative transition…</div>}
      {overview.refundLedger.length > 0 && <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle className="h-4 w-4" />{overview.refundLedger.length} immutable refund ledger entr{overview.refundLedger.length === 1 ? 'y' : 'ies'}</div>}
      {overview.auditTimeline.length > 0 && <details className="rounded-xl border border-slate-200 bg-white p-3" data-testid="financial-exception-audit-timeline">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-600">Audit timeline ({overview.auditTimeline.length})</summary>
        <div className="mt-2 space-y-2">{overview.auditTimeline.map((event, index) => <div key={String(event.id || index)} className="border-l-2 border-violet-200 pl-3 text-[11px] text-slate-600"><strong>{String(event.action || event.eventType || 'WORKFLOW_EVENT')}</strong><br />{String(event.createdAt || event.timestamp || '')} · {String(event.actorEmployeeId || event.actorId || 'SYSTEM')}</div>)}</div>
      </details>}
    </section>
  );
};
