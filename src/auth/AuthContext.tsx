import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../data/db';
import { v4 as uuidv4 } from 'uuid';
import type { UserRole, Evaluator } from '../types';

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
  evaluatorLogin: (name: string, email?: string) => Promise<{ success: boolean; error?: string }>;
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

    // Log login action to audit log for Super Admin visibility
    try {
      await db.auditLog.add({
        id: uuidv4(),
        timestamp: Date.now(),
        userId: evaluator.id,
        userName: evaluator.name,
        action: 'login',
        details: `${evaluator.role} "${evaluator.name}" logged in (${evaluator.email})`,
      });
    } catch (auditErr) {
      console.warn('Could not record login audit:', auditErr);
    }

    setUser(authUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
    return { success: true };
  }, []);

  const evaluatorLogin = useCallback(async (name: string, email?: string): Promise<{ success: boolean; error?: string }> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: 'Please enter your name to proceed.' };
    }

    try {
      const allEvaluators = await db.evaluators.toArray();
      // Look up existing evaluator by name (case-insensitive) or email if provided
      let evaluator = allEvaluators.find(
        e => e.name.toLowerCase() === trimmedName.toLowerCase() ||
             (email && e.email.toLowerCase() === email.toLowerCase().trim())
      );

      if (!evaluator) {
        // Create new evaluator entry
        const generatedEmail = email?.trim() || `${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@jklu.evaluator`;
        const newEvaluator: Evaluator = {
          id: uuidv4(),
          name: trimmedName,
          email: generatedEmail,
          role: 'Evaluator',
          active: true,
          createdAt: Date.now(),
        };
        await db.evaluators.add(newEvaluator);
        evaluator = newEvaluator;
      }

      if (!evaluator.active) {
        return { success: false, error: 'This evaluator profile is deactivated.' };
      }

      // Log login action to audit log for Super Admin visibility
      try {
        await db.auditLog.add({
          id: uuidv4(),
          timestamp: Date.now(),
          userId: evaluator.id,
          userName: evaluator.name,
          action: 'login',
          details: `Evaluator "${evaluator.name}" logged into the dynamic evaluation panel (${evaluator.email})`,
        });
      } catch (auditErr) {
        console.warn('Could not record evaluator login audit:', auditErr);
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
    } catch (err: any) {
      console.error('Evaluator login error:', err);
      // Fallback local session if db operation encounters an issue
      const fallbackId = `eval-${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const authUser: AuthUser = {
        id: fallbackId,
        name: trimmedName,
        email: email?.trim() || `${fallbackId}@jklu.evaluator`,
        role: 'Evaluator',
      };
      setUser(authUser);
      localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
      return { success: true };
    }
  }, []);

  const logout = useCallback(() => {
    if (user) {
      db.auditLog.add({
        id: uuidv4(),
        timestamp: Date.now(),
        userId: user.id,
        userName: user.name,
        action: 'logout',
        details: `${user.role} "${user.name}" logged out`,
      }).catch(() => {});
    }
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, [user]);


  return (
    <AuthContext.Provider value={{ user, isLoading, login, evaluatorLogin, logout }}>
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

