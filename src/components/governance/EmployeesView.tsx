import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Pencil, Plus, RefreshCw, Shield, UserX, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { APP_CONFIG } from '../../config';
import { PRESET_USERS } from '../../services/permissions';
import {
  createManagedEmployee,
  listManagedEmployees,
  updateManagedEmployee,
} from '../../services/employees/employeeManagementApi';
import {
  USER_ROLES,
  type EmployeeMutationInput,
  type ManagedEmployee,
  type SalesTeam,
  type UserRole,
} from '../../types';

interface EmployeeFormState {
  employeeId: string;
  name: string;
  email: string;
  firebaseUid: string;
  role: UserRole;
  active: boolean;
  salesTeamId: string;
  managerEmployeeId: string;
  department: string;
  designation: string;
  phone: string;
  joiningDate: string;
  reason: string;
}

const EMPTY_FORM: EmployeeFormState = {
  employeeId: '',
  name: '',
  email: '',
  firebaseUid: '',
  role: 'Sales Executive',
  active: true,
  salesTeamId: '',
  managerEmployeeId: '',
  department: '',
  designation: '',
  phone: '',
  joiningDate: '',
  reason: '',
};

function formFromEmployee(employee: ManagedEmployee): EmployeeFormState {
  return {
    employeeId: employee.employeeId,
    name: employee.name,
    email: employee.email,
    firebaseUid: employee.firebaseUid || '',
    role: employee.role,
    active: employee.active,
    salesTeamId: employee.salesTeamId || '',
    managerEmployeeId: employee.managerEmployeeId || '',
    department: employee.department || '',
    designation: employee.designation || '',
    phone: employee.phone || '',
    joiningDate: employee.joiningDate || '',
    reason: '',
  };
}

function demoEmployees(): ManagedEmployee[] {
  return PRESET_USERS.map((employee) => ({
    employeeId: employee.employeeId,
    name: employee.name,
    email: employee.email,
    firebaseUid: employee.firebaseUid,
    role: employee.role,
    active: employee.active,
    ...(employee.salesTeamId ? { salesTeamId: employee.salesTeamId } : {}),
    ...(employee.managerEmployeeId ? { managerEmployeeId: employee.managerEmployeeId } : {}),
    ...(employee.department ? { department: employee.department } : {}),
    ...(employee.phone ? { phone: employee.phone } : {}),
    createdAt: employee.createdAt,
    updatedAt: employee.lastLogin,
    createdByEmployeeId: 'demo-system',
    updatedByEmployeeId: 'demo-system',
    accessSummary: {
      scope: employee.role === 'Sales Executive'
        ? 'OWN Sales scope'
        : employee.role === 'Sales Manager'
          ? 'TEAM Sales scope'
          : employee.role === 'Reservations'
            ? 'ASSIGNED Reservations scope'
            : employee.role === 'Operations'
              ? 'ASSIGNED Operations scope'
              : employee.role === 'Accounts'
                ? 'Financial access'
                : employee.role === 'Founder' || employee.role === 'Admin'
                  ? 'Broad administrative access'
                  : 'Marketing scope',
      details: ['Demo identity. Production access is derived by the server.'],
    },
    reassignmentRequired: false,
  }));
}

export const EmployeesView: React.FC = () => {
  const { currentUser, selectUser } = useAuth();
  const [employees, setEmployees] = useState<ManagedEmployee[]>([]);
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [summaryEmployee, setSummaryEmployee] = useState<ManagedEmployee | null>(null);

  const loadEmployees = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listManagedEmployees(currentUser.employeeId);
      setEmployees(result.employees);
      setTeams(result.teams);
    } catch (loadError) {
      if (APP_CONFIG.DEMO_MODE) {
        setEmployees(demoEmployees());
        setTeams([]);
        setNotice('Demo directory shown. Connect Firebase Admin to manage production employees.');
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load employees.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, [currentUser.employeeId]);

  const employeeNames = useMemo(
    () => new Map(employees.map((employee) => [employee.employeeId, employee.name])),
    [employees],
  );
  const teamNames = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  );
  const eligibleManagers = employees.filter((employee) =>
    employee.active &&
    employee.role === 'Sales Manager' &&
    (!form.salesTeamId || employee.salesTeamId === form.salesTeamId)
  );
  const isSalesRole = form.role === 'Sales Executive' || form.role === 'Sales Manager';

  const openCreate = () => {
    setEditingEmployeeId(null);
    setForm(EMPTY_FORM);
    setEditorVisible(true);
    setError('');
  };

  const openEdit = (employee: ManagedEmployee) => {
    setEditingEmployeeId(employee.employeeId);
    setForm(formFromEmployee(employee));
    setEditorVisible(true);
    setError('');
  };

  const closeEditor = () => {
    setEditorVisible(false);
    setEditingEmployeeId(null);
    setForm(EMPTY_FORM);
    setSaving(false);
  };

  const updateForm = <K extends keyof EmployeeFormState>(field: K, value: EmployeeFormState[K]) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'role') {
        if (value !== 'Sales Executive' && value !== 'Sales Manager') {
          next.salesTeamId = '';
          next.managerEmployeeId = '';
        } else if (value === 'Sales Manager') {
          next.managerEmployeeId = '';
        }
      }
      if (field === 'salesTeamId') next.managerEmployeeId = '';
      return next;
    });
  };

  const submitEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const input: EmployeeMutationInput = {
      name: form.name,
      email: form.email,
      firebaseUid: form.firebaseUid || null,
      role: form.role,
      active: form.active,
      salesTeamId: isSalesRole ? form.salesTeamId || null : null,
      managerEmployeeId: form.role === 'Sales Executive' ? form.managerEmployeeId || null : null,
      department: form.department || null,
      designation: form.designation || null,
      phone: form.phone || null,
      joiningDate: form.joiningDate || null,
      ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
    };
    try {
      if (editingEmployeeId) {
        const updated = await updateManagedEmployee(editingEmployeeId, input, currentUser.employeeId);
        setEmployees((current) => current.map((employee) =>
          employee.employeeId === updated.employeeId ? updated : employee
        ));
        setNotice(`${updated.name} was updated.`);
      } else {
        const created = await createManagedEmployee(
          {
            ...input,
            employeeId: form.employeeId,
            name: form.name,
            email: form.email,
            role: form.role,
            active: form.active,
          },
          currentUser.employeeId,
        );
        setEmployees((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
        setNotice(`${created.name} was added.`);
      }
      closeEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save employee.');
      setSaving(false);
    }
  };

  const toggleEmployee = async (employee: ManagedEmployee) => {
    const action = employee.active ? 'deactivate' : 'activate';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Activate'} ${employee.name}?`)) return;
    setError('');
    setNotice('');
    try {
      const updated = await updateManagedEmployee(
        employee.employeeId,
        { active: !employee.active, reason: `${action} through Settings > Team & Access` },
        currentUser.employeeId,
      );
      setEmployees((current) => current.map((candidate) =>
        candidate.employeeId === updated.employeeId ? updated : candidate
      ));
      setNotice(`${updated.name} is now ${updated.active ? 'active' : 'inactive'}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : `Unable to ${action} employee.`);
    }
  };

  return (
    <div id="employees-view" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7056EE]">Settings &gt; Team &amp; Access</p>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Employee &amp; Access Management</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage stable BBOS identities, canonical roles, teams, managers, and account status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadEmployees()} className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50" aria-label="Refresh employees">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button id="add-employee-button" type="button" onClick={openCreate} className="inline-flex items-center gap-2 px-3 py-2 bg-[#7056EE] text-white rounded-lg text-xs font-bold hover:bg-[#5e43dc]">
            <Plus className="w-4 h-4" /> Add employee
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{notice}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-x-auto">
        <table className="w-full min-w-[880px] text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Role</th><th className="px-4 py-3 font-semibold">Team</th><th className="px-4 py-3 font-semibold">Manager</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading team...</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No employee records found.</td></tr>
            ) : employees.map((employee) => (
              <tr key={employee.employeeId} className="hover:bg-slate-50/70">
                <td className="px-4 py-3"><div className="font-bold text-slate-900">{employee.name}</div><div className="text-[11px] text-slate-500">{employee.email}</div><div className="text-[10px] font-mono text-slate-400">{employee.employeeId}</div></td>
                <td className="px-4 py-3 font-semibold text-slate-700">{employee.role}</td>
                <td className="px-4 py-3 text-slate-600">{employee.salesTeamId ? teamNames.get(employee.salesTeamId) || employee.salesTeamId : employee.department || '-'}</td>
                <td className="px-4 py-3 text-slate-600">{employee.managerEmployeeId ? employeeNames.get(employee.managerEmployeeId) || employee.managerEmployeeId : '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-bold ${employee.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><CheckCircle2 className="w-3 h-3" /> {employee.active ? 'Active' : 'Inactive'}</span>
                  {employee.reassignmentRequired && <div className="mt-1 text-[10px] text-amber-700">Reassignment required</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => setSummaryEmployee(employee)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="View access summary"><Eye className="w-4 h-4" /></button>
                    <button type="button" onClick={() => openEdit(employee)} className="p-2 rounded-lg text-[#7056EE] hover:bg-purple-50" title="Edit employee"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => void toggleEmployee(employee)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50" title={employee.active ? 'Deactivate employee' : 'Activate employee'}><UserX className="w-4 h-4" /></button>
                    {APP_CONFIG.DEMO_MODE && employee.active && employee.employeeId !== currentUser.employeeId && <button type="button" onClick={() => selectUser(employee.employeeId)} className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-700">Demo role</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editorVisible && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form onSubmit={submitEmployee} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div><h3 className="font-bold text-slate-900">{editingEmployeeId ? 'Edit employee' : 'Add employee'}</h3><p className="text-xs text-slate-500">employeeId is permanent after creation.</p></div>
              <button type="button" onClick={closeEditor} className="p-2 text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <label className="space-y-1"><span className="font-semibold text-slate-700">Employee ID *</span><input required disabled={Boolean(editingEmployeeId)} value={form.employeeId} onChange={(event) => updateForm('employeeId', event.target.value)} className="w-full px-3 py-2 border rounded-lg disabled:bg-slate-100" placeholder="emp-sales-03" /></label>
              <label className="space-y-1"><span className="font-semibold text-slate-700">Full name *</span><input required value={form.name} onChange={(event) => updateForm('name', event.target.value)} className="w-full px-3 py-2 border rounded-lg" /></label>
              <label className="space-y-1"><span className="font-semibold text-slate-700">Work email *</span><input required type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} className="w-full px-3 py-2 border rounded-lg" /></label>
              <label className="space-y-1"><span className="font-semibold text-slate-700">Firebase UID</span><input value={form.firebaseUid} onChange={(event) => updateForm('firebaseUid', event.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Optional until login is provisioned" /></label>
              <label className="space-y-1"><span className="font-semibold text-slate-700">Role *</span><select value={form.role} onChange={(event) => updateForm('role', event.target.value as UserRole)} className="w-full px-3 py-2 border rounded-lg bg-white">{USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
              <label className="space-y-1"><span className="font-semibold text-slate-700">Department</span><input value={form.department} onChange={(event) => updateForm('department', event.target.value)} className="w-full px-3 py-2 border rounded-lg" /></label>
              {isSalesRole && <label className="space-y-1"><span className="font-semibold text-slate-700">Sales team *</span><select required value={form.salesTeamId} onChange={(event) => updateForm('salesTeamId', event.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white"><option value="">Select team</option>{teams.filter((team) => team.active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
              {form.role === 'Sales Executive' && <label className="space-y-1"><span className="font-semibold text-slate-700">Manager *</span><select required value={form.managerEmployeeId} onChange={(event) => updateForm('managerEmployeeId', event.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white"><option value="">Select manager</option>{eligibleManagers.map((manager) => <option key={manager.employeeId} value={manager.employeeId}>{manager.name}</option>)}</select></label>}
              <label className="space-y-1"><span className="font-semibold text-slate-700">Designation / title</span><input value={form.designation} onChange={(event) => updateForm('designation', event.target.value)} className="w-full px-3 py-2 border rounded-lg" /></label>
              <label className="space-y-1"><span className="font-semibold text-slate-700">Phone</span><input value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} className="w-full px-3 py-2 border rounded-lg" /></label>
              <label className="space-y-1"><span className="font-semibold text-slate-700">Joining date</span><input type="date" value={form.joiningDate} onChange={(event) => updateForm('joiningDate', event.target.value)} className="w-full px-3 py-2 border rounded-lg" /></label>
              <label className="flex items-center gap-2 mt-6"><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /><span className="font-semibold text-slate-700">Active BBOS employee</span></label>
              <label className="space-y-1 sm:col-span-2"><span className="font-semibold text-slate-700">Reason / administrative note</span><textarea value={form.reason} onChange={(event) => updateForm('reason', event.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg" /></label>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2"><button type="button" onClick={closeEditor} className="px-4 py-2 border rounded-lg text-xs font-bold text-slate-600">Cancel</button><button disabled={saving} className="px-4 py-2 bg-[#7056EE] text-white rounded-lg text-xs font-bold disabled:opacity-50">{saving ? 'Saving...' : editingEmployeeId ? 'Save changes' : 'Create employee'}</button></div>
          </form>
        </div>
      )}

      {summaryEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between"><div className="flex gap-3"><div className="w-10 h-10 rounded-xl bg-purple-100 text-[#7056EE] flex items-center justify-center"><Shield className="w-5 h-5" /></div><div><h3 className="font-bold text-slate-900">{summaryEmployee.name}</h3><p className="text-xs text-slate-500">{summaryEmployee.role}</p></div></div><button type="button" onClick={() => setSummaryEmployee(null)}><X className="w-4 h-4 text-slate-500" /></button></div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200"><div className="font-bold text-slate-900 text-sm">{summaryEmployee.accessSummary.scope}</div><ul className="mt-2 space-y-1 text-xs text-slate-600 list-disc pl-4">{summaryEmployee.accessSummary.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div>
            <p className="text-[11px] text-slate-500">Access is derived from the canonical role and organizational scope. Per-user permission overrides are not supported.</p>
          </div>
        </div>
      )}
    </div>
  );
};
