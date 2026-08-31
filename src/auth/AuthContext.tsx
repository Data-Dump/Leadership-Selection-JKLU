import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../data/db';
import type { UserRole } from '../types';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'jklu_session_v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AuthUser;
        setUser(parsed);
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const evaluator = await db.evaluators
      .where('email')
      .equals(email.toLowerCase().trim())
      .first();

    if (!evaluator) {
      return { success: false, error: 'No account found with that email address.' };
    }
    if (!evaluator.active) {
      return { success: false, error: 'This account has been deactivated. Contact an administrator.' };
    }

    // Password verification
    const expectedPassword = evaluator.passwordHash?.startsWith('demo:')
      ? evaluator.passwordHash.slice(5)
      : (evaluator.passwordHash || 'admin123');

    if (password !== expectedPassword) {
      return { success: false, error: 'Incorrect password.' };
    }

    const authUser: AuthUser = {
      id: evaluator.id,
      name: evaluator.name,
      email: evaluator.email,
      role: evaluator.role,
    };
    setUser(authUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useRequireRole(requiredRoles: UserRole[]) {
  const { user } = useAuth();
  if (!user) return false;
  return requiredRoles.includes(user.role);
}
