import React from 'react';
import { PRESET_USERS } from '../../services/permissions';
import { useAuth } from '../../context/AuthContext';
import { Users, Shield, Mail, CheckCircle2, UserCheck, ShieldAlert } from 'lucide-react';

export const EmployeesView: React.FC = () => {
  const { currentUser, switchUser } = useAuth();

  return (
    <div id="employees-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Team & Employee Directory</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
              {PRESET_USERS.length} Team Members
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Role assignments, department affiliations, and simulated login switching
          </p>
        </div>
      </div>

      {/* Employee Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PRESET_USERS.map((user) => {
          const isActive = user.id === currentUser.id;

          return (
            <div
              key={user.id}
              id={`employee-card-${user.id}`}
              className={`bg-white p-5 rounded-2xl border shadow-2xs space-y-4 transition-all flex flex-col justify-between ${
                isActive ? 'border-[#7056EE] ring-2 ring-[#7056EE]/20' : 'border-slate-200'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7056EE] to-[#5e43dc] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <h3 className="font-bold text-slate-900 text-xs sm:text-sm">{user.name}</h3>
                        {isActive && (
                          <span className="text-[9px] font-black px-1.5 py-0.2 bg-[#7056EE] text-white rounded">
                            CURRENT
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Assigned Role:</span>
                    <span className="font-bold text-slate-900">{user.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Department:</span>
                    <span className="font-semibold text-slate-800">{user.department}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-emerald-600 font-bold flex items-center">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Active Account
                </span>
                {!isActive ? (
                  <button
                    id={`switch-to-user-${user.id}`}
                    onClick={() => switchUser(user.id)}
                    className="px-3 py-1 bg-slate-100 hover:bg-[#7056EE] hover:text-white rounded-lg text-xs font-bold text-slate-700 transition-colors"
                  >
                    Simulate Role
                  </button>
                ) : (
                  <span className="text-xs font-bold text-[#7056EE]">Active Session</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
