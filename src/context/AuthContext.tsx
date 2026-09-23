import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { RolePermissions, USER_ROLES, UserProfile, UserRole } from '../types';
import { ROLE_DEFINITIONS, PRESET_USERS } from '../services/permissions';
import { APP_CONFIG } from '../config';
import { auth } from '../lib/firebase';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User,
} from 'firebase/auth';
import {
  assertDemoIdentitySwitchingAllowed,
  fetchAuthoritativeIdentity,
  resolveInitialBrowserIdentity,
} from '../services/auth/authoritativeIdentity';

interface AuthContextType {
  currentUser: UserProfile;
  permissions: RolePermissions;
  switchRole: (role: UserRole) => void;
  selectUser: (userId: string) => void;
  availableUsers: UserProfile[];
  allRoles: UserRole[];
  loginWithFirebase: (email: string, pass: string) => Promise<void>;
  signupWithFirebase: (name: string, email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  isFirebaseAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface ProductionSignInGateProps {
  loading: boolean;
  error: string;
  firebaseAuthenticated: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

const ProductionSignInGate: React.FC<ProductionSignInGateProps> = ({
  loading,
  error,
  firebaseAuthenticated,
  onLogin,
  onLogout,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    try {
      await onLogin(email, password);
    } catch (loginError: any) {
      setFormError(loginError?.message || 'Unable to sign in.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Booking Bridge OS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with an approved BBOS employee account.
          </p>
        </div>

        {(formError || error) && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {formError || error}
          </div>
        )}

        {firebaseAuthenticated && error ? (
          <button
            type="button"
            onClick={() => void onLogout()}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Sign out of unauthorized account
          </button>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Employee email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#7056EE] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? 'Verifying employee access…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() =>
    resolveInitialBrowserIdentity(
      APP_CONFIG.DEMO_MODE,
      APP_CONFIG.DEMO_MODE ? localStorage.getItem('booking_bridge_active_user') : null,
      PRESET_USERS[0],
    ),
  );
  const [isFirebaseAuthenticated, setIsFirebaseAuthenticated] = useState(false);
  const [isIdentityLoading, setIsIdentityLoading] = useState(!APP_CONFIG.DEMO_MODE);
  const [identityError, setIdentityError] = useState('');

  useEffect(() => {
    if (APP_CONFIG.DEMO_MODE && currentUser) {
      localStorage.setItem('booking_bridge_active_user', JSON.stringify(currentUser));
    } else {
      // Production identity and role are never restored from browser storage.
      localStorage.removeItem('booking_bridge_active_user');
    }
  }, [currentUser]);

  const resolveFirebaseUser = useCallback(async (firebaseUser: User): Promise<UserProfile> => {
    setIsIdentityLoading(true);
    setIdentityError('');
    try {
      const employee = await fetchAuthoritativeIdentity(firebaseUser);
      setCurrentUser(employee);
      setIsFirebaseAuthenticated(true);
      return employee;
    } catch (error: any) {
      setCurrentUser(null);
      setIsFirebaseAuthenticated(true);
      const message = error?.message || 'This Firebase account is not authorized for BBOS.';
      setIdentityError(message);
      throw error;
    } finally {
      setIsIdentityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      if (!APP_CONFIG.DEMO_MODE) {
        setIdentityError('Firebase Auth is not initialized.');
        setIsIdentityLoading(false);
      }
      return;
    }

    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      if (user) {
        void resolveFirebaseUser(user).catch(() => {
          // The access gate renders the authoritative server error.
        });
      } else {
        setIsFirebaseAuthenticated(false);
        setIdentityError('');
        setIsIdentityLoading(false);
        if (!APP_CONFIG.DEMO_MODE) setCurrentUser(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [resolveFirebaseUser]);

  const switchRole = (role: UserRole) => {
    assertDemoIdentitySwitchingAllowed(APP_CONFIG.DEMO_MODE);
    const matchingPreset = PRESET_USERS.find((user) => user.role === role);
    if (matchingPreset) setCurrentUser(matchingPreset);
  };

  const selectUser = (userId: string) => {
    assertDemoIdentitySwitchingAllowed(APP_CONFIG.DEMO_MODE);
    const user = PRESET_USERS.find((candidate) => candidate.id === userId);
    if (user) setCurrentUser(user);
  };

  const loginWithFirebase = async (email: string, pass: string) => {
    if (!auth) throw new Error('Firebase Auth is not initialized.');
    const credential = await signInWithEmailAndPassword(auth, email, pass);
    await resolveFirebaseUser(credential.user);
  };

  const signupWithFirebase = async (_name: string, email: string, pass: string) => {
    if (!auth) throw new Error('Firebase Auth is not initialized.');
    const credential = await createUserWithEmailAndPassword(auth, email, pass);
    try {
      await resolveFirebaseUser(credential.user);
    } catch {
      throw new Error(
        'Firebase account created, but BBOS access requires an approved active employee record.',
      );
    }
  };

  const logout = async () => {
    try {
      if (auth) await firebaseSignOut(auth);
    } finally {
      setIsFirebaseAuthenticated(false);
      setIdentityError('');
      setCurrentUser(APP_CONFIG.DEMO_MODE ? PRESET_USERS[0] : null);
    }
  };

  if (!currentUser) {
    return (
      <ProductionSignInGate
        loading={isIdentityLoading}
        error={identityError}
        firebaseAuthenticated={isFirebaseAuthenticated}
        onLogin={loginWithFirebase}
        onLogout={logout}
      />
    );
  }

  const permissions = ROLE_DEFINITIONS[currentUser.role];

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        permissions,
        switchRole,
        selectUser,
        availableUsers: APP_CONFIG.DEMO_MODE ? PRESET_USERS : [],
        allRoles: APP_CONFIG.DEMO_MODE
          ? [...USER_ROLES]
          : [currentUser.role],
        loginWithFirebase,
        signupWithFirebase,
        logout,
        isFirebaseAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
