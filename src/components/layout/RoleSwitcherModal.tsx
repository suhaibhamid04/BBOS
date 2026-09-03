import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { ROLE_DEFINITIONS, PRESET_USERS } from '../../services/permissions';
import { Shield, Check, User, Sparkles, X, LogIn, Lock } from 'lucide-react';

interface RoleSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoleSwitcherModal: React.FC<RoleSwitcherModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, switchRole, selectUser, availableUsers, loginWithFirebase, isFirebaseAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<'SWITCH_PERSONA' | 'FIREBASE_AUTH'>('SWITCH_PERSONA');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  if (!isOpen) return null;

  const handleFirebaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    try {
      await loginWithFirebase(email, password);
      setAuthSuccess('Successfully authenticated via Firebase Auth.');
    } catch (err: any) {
      setAuthError(err.message || 'Firebase authentication failed');
    }
  };

  return (
    <div id="role-switcher-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="role-switcher-modal" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#F0A608] to-[#7056EE] p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#F0A608]" />
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white">Access Control & Role Simulator</h2>
              <p className="text-xs text-slate-400">Switch personas instantly to verify Role-Based Access Control (RBAC)</p>
            </div>
          </div>
          <button
            id="close-role-switcher-button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 space-x-4">
          <button
            id="tab-switch-persona"
            onClick={() => setActiveTab('SWITCH_PERSONA')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'SWITCH_PERSONA'
                ? 'border-[#7056EE] text-[#7056EE]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Select Team Member Persona ({availableUsers.length})</span>
          </button>
          <button
            id="tab-firebase-auth"
            onClick={() => setActiveTab('FIREBASE_AUTH')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'FIREBASE_AUTH'
                ? 'border-[#7056EE] text-[#7056EE]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Firebase Auth Credentials</span>
            {isFirebaseAuthenticated && (
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            )}
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
          {activeTab === 'SWITCH_PERSONA' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                Select an operational persona to simulate UI permissions, AI capabilities, and data access scope:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableUsers.map((user) => {
                  const isSelected = currentUser.id === user.id;
                  const roleDef = ROLE_DEFINITIONS[user.role];
                  return (
                    <button
                      key={user.id}
                      id={`persona-option-${user.id}`}
                      onClick={() => {
                        selectUser(user.id);
                        onClose();
                      }}
                      className={`p-3.5 rounded-xl text-left border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#7056EE] bg-[#7056EE]/5 ring-1 ring-[#7056EE]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                            isSelected ? 'bg-[#7056EE] text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{user.name}</p>
                            <p className="text-[11px] font-semibold text-[#7056EE]">{user.role}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-[#7056EE] text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2 line-clamp-2">{roleDef?.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <form onSubmit={handleFirebaseLogin} className="space-y-4 max-w-md mx-auto py-2">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-semibold">Firebase Authentication Integration</p>
                <p className="mt-0.5 text-amber-800">
                  Firebase project is connected. You can log in with an existing Firebase Auth account or continue testing in Instant Role Mode.
                </p>
              </div>

              {authError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
                  {authError}
                </div>
              )}
              {authSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl">
                  {authSuccess}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  id="auth-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#7056EE]"
                  placeholder="admin@bookingbridge.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <input
                  id="auth-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#7056EE]"
                  placeholder="••••••••"
                />
              </div>

              <button
                id="submit-firebase-login"
                type="submit"
                className="w-full py-2.5 bg-[#7056EE] text-white text-xs font-semibold rounded-lg hover:bg-[#5e43dc] transition-colors flex items-center justify-center space-x-2 shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                <span>Authenticate with Firebase</span>
              </button>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#F0A608]" />
            <span>Active: <strong>{currentUser.name}</strong> ({currentUser.role})</span>
          </div>
          <button
            id="close-role-switcher-footer-btn"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
