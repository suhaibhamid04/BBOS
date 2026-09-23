import React from 'react';
import { USER_ROLES } from '../../types';
import { ROLE_DEFINITIONS } from '../../services/permissions';
import { Shield, Check, X } from 'lucide-react';

export const RolesPermissionsView: React.FC = () => {
  const roles = USER_ROLES;

  const permissionKeys: { key: keyof typeof ROLE_DEFINITIONS['Founder']; label: string }[] = [
    { key: 'canViewAllSales', label: 'View Full Sales Pipeline & All Leads' },
    { key: 'canManageLeads', label: 'Create & Update Inbound Leads' },
    { key: 'canSendQuotes', label: 'Draft & Send Tour Quotations' },
    { key: 'canManageMarketing', label: 'Manage Ad Campaigns & Creatives' },
    { key: 'canViewFinancials', label: 'View Margins, Net Profit & Accounts' },
    { key: 'canManageReservations', label: 'Access Reservations Inventory Workspace' },
    { key: 'canManageOperations', label: 'Manage Fleet, Hotels & Ground Vouchers' },
    { key: 'canManageUsers', label: 'Manage Team Members & Access Roles' },
    { key: 'canAccessAiCommand', label: 'Access AI Command Center & Copilots' },
    { key: 'canApproveActions', label: 'Review & Sign Off High-Risk Approvals' },
    { key: 'canViewAuditLogs', label: 'Access Immutable Audit Trail Logs' },
    { key: 'canManageSettings', label: 'Update System & Legal Entity Settings' },
  ];

  return (
    <div id="roles-permissions-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Role-Based Access Control (RBAC) Matrix</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Enterprise Multi-Role
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Module-level security boundaries, financial viewing rights, and approval authorities
          </p>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-bold">
                <th className="py-4 px-4 sticky left-0 bg-slate-900 z-10 w-72">Permission Capability</th>
                {roles.map((role) => (
                  <th key={role} className="py-4 px-3 text-center whitespace-nowrap min-w-[120px]">
                    <div className="flex flex-col items-center">
                      <span>{role}</span>
                      <span className="text-[9px] text-slate-400 font-normal mt-0.5">
                        {role === 'Founder' ? 'SuperAdmin' : role}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {permissionKeys.map((p, idx) => (
                <tr key={p.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="py-3.5 px-4 font-semibold text-slate-900 sticky left-0 bg-inherit z-10 border-r border-slate-100">
                    {p.label}
                  </td>
                  {roles.map((role) => {
                    const hasPerm = ROLE_DEFINITIONS[role][p.key];
                    return (
                      <td key={role} className="py-3.5 px-3 text-center">
                        {hasPerm ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-300 flex items-center justify-center mx-auto">
                            <X className="w-3 h-3 stroke-[2]" />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
