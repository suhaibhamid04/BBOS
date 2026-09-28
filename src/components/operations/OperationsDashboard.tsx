import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bed,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  Route,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { APP_CONFIG } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { listManagedEmployees } from '../../services/employees/employeeManagementApi';
import {
  assignOperationsEmployee,
  createEmergencySpendRequest,
  createOperationalChangeRequest,
  createOperationalIssue,
  decideEmergencySpend,
  fetchOperationsControlRoom,
  updateOperationalIssue,
} from '../../services/operations/operationsControlRoomApi';
import { PRESET_USERS } from '../../services/permissions';
import type {
  OperationalAttentionItem,
  OperationalItem,
  OperationsControlRoomResponse,
} from '../../types/operationsControlRoom';

interface OperationsEmployeeOption {
  employeeId: string;
  name: string;
}

const itemIcons = {
  ARRIVAL: Route,
  DEPARTURE: Route,
  HOTEL_CHECK_IN: Bed,
  HOTEL_CHECK_OUT: Bed,
  TRANSPORT: Car,
  ACTIVITY: CalendarDays,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T00:00:00`));
}

function label(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
}

function OperationsItemCard({
  item,
  canAssign,
  onOpen,
  onAssign,
}: {
  key?: React.Key;
  item: OperationalItem;
  canAssign: boolean;
  onOpen: () => void;
  onAssign: () => void;
}) {
  const Icon = itemIcons[item.type];
  const readinessClass = item.readiness === 'READY'
    ? 'bg-emerald-100 text-emerald-800'
    : item.readiness === 'NOT_READY'
      ? 'bg-rose-100 text-rose-800'
      : 'bg-amber-100 text-amber-800';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-violet-50 p-2 text-[#7056EE]"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.bookingReference} · {item.customerName || item.customerId}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700">{formatDate(item.date)}{item.time ? ` · ${item.time}` : ''}</span>
              <span className={`rounded-full px-2 py-0.5 font-bold ${readinessClass}`}>{item.readiness.replaceAll('_', ' ')}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{item.serviceStatus}</span>
            </div>
          </div>
        </div>
      </button>
      {canAssign && (
        <button type="button" onClick={onAssign} className="mt-3 text-xs font-bold text-[#7056EE] hover:text-[#6044E6]">
          {item.assignedOperationsEmployeeId ? 'Reassign Operations' : 'Assign Operations'}
        </button>
      )}
    </div>
  );
}

export const OperationsDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [data, setData] = useState<OperationsControlRoomResponse | null>(null);
  const [employees, setEmployees] = useState<OperationsEmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState<OperationalItem | null>(null);
  const [assignmentBookingId, setAssignmentBookingId] = useState<string | null>(null);
  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [liveAction, setLiveAction] = useState<'ISSUE' | 'SPEND' | 'CHANGE' | null>(null);
  const [liveActionBookingId, setLiveActionBookingId] = useState('');
  const [liveTitle, setLiveTitle] = useState('');
  const [liveDescription, setLiveDescription] = useState('');
  const [liveAmount, setLiveAmount] = useState('');
  const [savingLiveAction, setSavingLiveAction] = useState(false);
  const canAssign = currentUser.role === 'Founder' || currentUser.role === 'Admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const controlRoom = await fetchOperationsControlRoom(currentUser.employeeId);
      setData(controlRoom);
      if (canAssign) {
        const options = APP_CONFIG.DEMO_MODE
          ? PRESET_USERS
              .filter((employee) => employee.role === 'Operations' && employee.active)
              .map((employee) => ({ employeeId: employee.employeeId, name: employee.name }))
          : (await listManagedEmployees(currentUser.employeeId)).employees
              .filter((employee) => employee.role === 'Operations' && employee.active)
              .map((employee) => ({ employeeId: employee.employeeId, name: employee.name }));
        setEmployees(options);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load the Operations Control Room.');
    } finally {
      setLoading(false);
    }
  }, [canAssign, currentUser.employeeId]);

  useEffect(() => { void load(); }, [load]);

  const openAssignment = (bookingId: string, existingEmployeeId?: string) => {
    setAssignmentBookingId(bookingId);
    setAssignmentEmployeeId(existingEmployeeId || employees[0]?.employeeId || '');
  };

  const submitAssignment = async () => {
    if (!assignmentBookingId || !assignmentEmployeeId) return;
    setAssigning(true);
    setError('');
    try {
      await assignOperationsEmployee(
        assignmentBookingId,
        assignmentEmployeeId,
        currentUser.employeeId,
        'Assigned from Operations Control Room',
      );
      setAssignmentBookingId(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update the Operations assignment.');
    } finally {
      setAssigning(false);
    }
  };

  const openLiveAction = (kind: 'ISSUE' | 'SPEND' | 'CHANGE', bookingId: string) => {
    setLiveAction(kind);
    setLiveActionBookingId(bookingId);
    setLiveTitle('');
    setLiveDescription('');
    setLiveAmount('');
  };

  const submitLiveAction = async () => {
    if (!liveAction || !liveActionBookingId || !liveTitle.trim()) return;
    setSavingLiveAction(true);
    setError('');
    try {
      if (liveAction === 'ISSUE') {
        await createOperationalIssue(liveActionBookingId, {
          category: 'OTHER', title: liveTitle.trim(), description: liveDescription.trim() || liveTitle.trim(),
          priority: 'MEDIUM', hasFinancialImpact: false,
        }, currentUser.employeeId);
      } else if (liveAction === 'SPEND') {
        if (!/^\d+(\.\d{1,2})?$/.test(liveAmount) || Number(liveAmount) <= 0) throw new Error('Enter a valid positive amount with at most two decimal places.');
        await createEmergencySpendRequest(liveActionBookingId, {
          amountMinor: Math.round(Number(liveAmount) * 100), currency: 'INR', purpose: liveTitle.trim(),
          category: 'OTHER', reason: liveDescription.trim() || liveTitle.trim(),
        }, currentUser.employeeId);
      } else {
        await createOperationalChangeRequest(liveActionBookingId, {
          changeType: 'SERVICE_SCOPE', description: liveDescription.trim() || liveTitle.trim(), linkedService: undefined,
        }, currentUser.employeeId);
      }
      setLiveAction(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the operational action.');
    } finally {
      setSavingLiveAction(false);
    }
  };

  const resolveIssue = async (issue: OperationsControlRoomResponse['openIssues'][number]) => {
    const resolutionNotes = window.prompt('Resolution notes');
    if (!resolutionNotes?.trim()) return;
    try {
      await updateOperationalIssue(issue.bookingId, issue.id, { status: 'RESOLVED', resolutionNotes: resolutionNotes.trim(), expectedUpdatedAt: issue.updatedAt }, currentUser.employeeId);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to resolve the issue.');
    }
  };

  const decideSpend = async (request: OperationsControlRoomResponse['pendingSpendRequests'][number], decision: 'APPROVED' | 'REJECTED') => {
    const reason = decision === 'REJECTED' ? window.prompt('Rejection reason') : undefined;
    if (decision === 'REJECTED' && !reason?.trim()) return;
    try {
      await decideEmergencySpend(request, decision, currentUser.employeeId, reason?.trim());
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to decide the spend request.');
    }
  };

  const selectedDetails = useMemo(() => selectedItem
    ? Object.entries(selectedItem.details).filter(([, value]) => value !== undefined && value !== '')
    : [], [selectedItem]);

  if (loading && !data) {
    return <div className="flex min-h-[360px] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading Control Room…</div>;
  }

  return (
    <div id="operations-dashboard" className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Operations Control Room</h2>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Server-authoritative</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Today’s execution, the next seven days, and issues requiring action.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Today', data.summary.todayCount, 'text-[#7056EE]'],
              ['Upcoming', data.summary.upcomingCount, 'text-sky-600'],
              ['Attention', data.summary.attentionCount, 'text-rose-600'],
              ['Ready', data.summary.readyCount, 'text-emerald-600'],
            ].map(([title, value, color]) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</p>
                <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Today · {formatDate(data.asOf)}</h3>
              <span className="text-xs text-slate-500">{data.today.length} execution item{data.today.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.today.map((item) => <OperationsItemCard key={item.id} item={item} canAssign={canAssign} onOpen={() => setSelectedItem(item)} onAssign={() => openAssignment(item.bookingId, item.assignedOperationsEmployeeId)} />)}
            </div>
            {!data.today.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No execution items scheduled today.</div>}
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Open guest issues</h3><span className="text-xs font-bold text-rose-600">{data.openIssues.length}</span></div>
              <div className="mt-3 space-y-2">
                {data.openIssues.map((issue) => <div key={issue.id} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between gap-2"><p className="text-sm font-bold text-slate-900">{issue.title}</p><span className="text-[10px] font-bold text-rose-700">{issue.priority}</span></div><p className="mt-1 text-xs text-slate-500">{issue.status.replaceAll('_', ' ')}</p><button type="button" onClick={() => void resolveIssue(issue)} className="mt-2 text-xs font-bold text-emerald-700">Mark resolved</button></div>)}
                {!data.openIssues.length && <p className="text-xs text-slate-500">No unresolved guest issues.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Emergency spend</h3><span className="text-xs font-bold text-amber-700">{data.pendingSpendRequests.length}</span></div>
              <div className="mt-3 space-y-2">
                {data.pendingSpendRequests.map((request) => <div key={request.id} className="rounded-lg bg-amber-50 p-3"><p className="text-sm font-bold text-slate-900">{request.purpose}</p><p className="mt-1 text-xs text-slate-600">{request.currency} {(request.amountMinor / 100).toFixed(2)} · approval required</p>{canAssign && <div className="mt-2 flex gap-2"><button type="button" onClick={() => void decideSpend(request, 'APPROVED')} className="text-xs font-bold text-emerald-700">Approve</button><button type="button" onClick={() => void decideSpend(request, 'REJECTED')} className="text-xs font-bold text-rose-700">Reject</button></div>}</div>)}
                {!data.pendingSpendRequests.length && <p className="text-xs text-slate-500">No pending spend requests.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Commercial follow-up</h3><span className="text-xs font-bold text-violet-700">{data.commercialChangeRequests.length}</span></div>
              <div className="mt-3 space-y-2">
                {data.commercialChangeRequests.map((request) => <div key={request.id} className="rounded-lg bg-violet-50 p-3"><p className="text-sm font-bold text-slate-900">{request.changeType.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-600">{request.description}</p></div>)}
                {!data.commercialChangeRequests.length && <p className="text-xs text-slate-500">No operational changes await commercial review.</p>}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Upcoming</h3>
              <span className="text-xs text-slate-500">Through {formatDate(data.horizonEnd)}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.upcoming.map((item) => <OperationsItemCard key={item.id} item={item} canAssign={canAssign} onOpen={() => setSelectedItem(item)} onAssign={() => openAssignment(item.bookingId, item.assignedOperationsEmployeeId)} />)}
            </div>
            {!data.upcoming.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No execution items in the upcoming window.</div>}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Attention Required</h3>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">{data.attentionRequired.length}</span>
            </div>
            <div className="space-y-2">
              {data.attentionRequired.map((item: OperationalAttentionItem) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{item.message}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{item.bookingReference}{item.customerName ? ` · ${item.customerName}` : ''}{item.date ? ` · ${formatDate(item.date)}` : ''}</p>
                  </div>
                  {canAssign && item.code === 'OPERATIONS_ASSIGNMENT_MISSING' && (
                    <button type="button" onClick={() => openAssignment(item.bookingId)} className="rounded-lg bg-[#7056EE] px-3 py-2 text-xs font-bold text-white hover:bg-[#6044E6]">Assign</button>
                  )}
                </div>
              ))}
              {!data.attentionRequired.length && <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" />No near-term issues require attention.</div>}
            </div>
          </section>
        </>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={() => setSelectedItem(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wider text-[#7056EE]">Operational detail</p><h3 className="mt-1 text-lg font-bold text-slate-900">{selectedItem.title}</h3></div>
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Booking</span><span className="font-semibold text-slate-900">{selectedItem.bookingReference}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Guest</span><span className="text-right font-semibold text-slate-900">{selectedItem.customerName || selectedItem.customerId}</span></div>
              {selectedItem.customerPhone && <div className="flex justify-between gap-4"><span className="text-slate-500">Guest phone</span><span className="font-semibold text-slate-900">{selectedItem.customerPhone}</span></div>}
              <div className="flex justify-between gap-4"><span className="text-slate-500">Date</span><span className="font-semibold text-slate-900">{formatDate(selectedItem.date)}{selectedItem.time ? ` · ${selectedItem.time}` : ''}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Commercial clearance</span><span className="font-semibold text-slate-900">{selectedItem.commercialClearance.replaceAll('_', ' ')}</span></div>
              {selectedDetails.map(([key, value]) => <div key={key} className="flex justify-between gap-4"><span className="text-slate-500">{label(key)}</span><span className="text-right font-semibold text-slate-900">{Array.isArray(value) ? value.join(', ') : String(value)}</span></div>)}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => openLiveAction('ISSUE', selectedItem.bookingId)} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">Report issue</button>
              <button type="button" onClick={() => openLiveAction('SPEND', selectedItem.bookingId)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">Request spend</button>
              <button type="button" onClick={() => openLiveAction('CHANGE', selectedItem.bookingId)} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white">Escalate commercial change</button>
              {canAssign && <button type="button" onClick={() => openAssignment(selectedItem.bookingId, selectedItem.assignedOperationsEmployeeId)} className="inline-flex items-center gap-2 rounded-lg bg-[#7056EE] px-3 py-2 text-xs font-bold text-white hover:bg-[#6044E6]"><UserRoundCheck className="h-4 w-4" />{selectedItem.assignedOperationsEmployeeId ? 'Reassign Operations' : 'Assign Operations'}</button>}
            </div>
          </aside>
        </div>
      )}

      {assignmentBookingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setAssignmentBookingId(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Assign Operations employee</h3>
            <p className="mt-1 text-sm text-slate-500">Only active employees with the canonical Operations role are eligible.</p>
            <select value={assignmentEmployeeId} onChange={(event) => setAssignmentEmployeeId(event.target.value)} className="mt-5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
              <option value="">Select employee</option>
              {employees.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.name} ({employee.employeeId})</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAssignmentBookingId(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" disabled={!assignmentEmployeeId || assigning} onClick={() => void submitAssignment()} className="inline-flex items-center gap-2 rounded-lg bg-[#7056EE] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{assigning && <Loader2 className="h-4 w-4 animate-spin" />}Save assignment</button>
            </div>
          </div>
        </div>
      )}

      {liveAction && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setLiveAction(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">{liveAction === 'ISSUE' ? 'Report guest issue' : liveAction === 'SPEND' ? 'Request emergency spend' : 'Escalate commercial change'}</h3>
            <input className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder={liveAction === 'ISSUE' ? 'Issue summary' : liveAction === 'SPEND' ? 'Spend purpose' : 'Change summary'} value={liveTitle} onChange={(event) => setLiveTitle(event.target.value)} />
            {liveAction === 'SPEND' && <input className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" inputMode="decimal" placeholder="Amount in INR" value={liveAmount} onChange={(event) => setLiveAmount(event.target.value)} />}
            <textarea className="mt-3 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Description / reason" value={liveDescription} onChange={(event) => setLiveDescription(event.target.value)} />
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setLiveAction(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" disabled={!liveTitle.trim() || savingLiveAction} onClick={() => void submitLiveAction()} className="rounded-lg bg-[#7056EE] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
