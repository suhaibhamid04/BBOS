import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, RolePermissions } from '../types';
import { ROLE_DEFINITIONS, PRESET_USERS } from '../services/permissions';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

interface AuthContextType {
  currentUser: UserProfile;
  permissions: RolePermissions;
  switchRole: (role: UserRole) => void;
  selectUser: (userId: string) => void;
  availableUsers: UserProfile[];
  allRoles: UserRole[];
  loginWithFirebase: (email: string, pass: string) => Promise<void>;
  signupWithFirebase: (name: string, email: string, pass: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  isFirebaseAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('booking_bridge_active_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return PRESET_USERS[0]; // Default: Founder (Suhaib Hamid)
  });

  const [isFirebaseAuthenticated, setIsFirebaseAuthenticated] = useState(false);

  useEffect(() => {
    localStorage.setItem('booking_bridge_active_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsFirebaseAuthenticated(true);
        // If user logged in via Firebase Auth, reflect their email
        setCurrentUser((prev) => ({
          ...prev,
          email: user.email || prev.email,
          name: user.displayName || prev.name,
          lastLogin: new Date().toISOString(),
        }));
      } else {
        setIsFirebaseAuthenticated(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const permissions = ROLE_DEFINITIONS[currentUser.role] || ROLE_DEFINITIONS.Founder;

  const switchRole = (role: UserRole) => {
    const matchingPreset = PRESET_USERS.find(u => u.role === role);
    if (matchingPreset) {
      setCurrentUser(matchingPreset);
    } else {
      setCurrentUser(prev => ({
        ...prev,
        role,
        department: ROLE_DEFINITIONS[role]?.description || 'Operations'
      }));
    }
  };

  const selectUser = (userId: string) => {
    const user = PRESET_USERS.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
    }
  };

  const loginWithFirebase = async (email: string, pass: string) => {
    if (!auth) throw new Error('Firebase Auth is not initialized.');
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signupWithFirebase = async (name: string, email: string, pass: string, role: UserRole) => {
    if (!auth) throw new Error('Firebase Auth is not initialized.');
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const newUser: UserProfile = {
      id: userCredential.user.uid,
      name,
      email,
      phone: '+91 94190 00000',
      role,
      department: ROLE_DEFINITIONS[role].description,
      active: true,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    setCurrentUser(newUser);
  };

  const logout = async () => {
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch (err) {
        console.warn('Firebase logout notice:', err);
      }
    }
    // Reset to demo Founder for continuous testing
    setCurrentUser(PRESET_USERS[0]);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        permissions,
        switchRole,
        selectUser,
        availableUsers: PRESET_USERS,
        allRoles: Object.keys(ROLE_DEFINITIONS) as UserRole[],
        loginWithFirebase,
        signupWithFirebase,
        logout,
        isFirebaseAuthenticated
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
