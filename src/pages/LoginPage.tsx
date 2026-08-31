import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../data/db';
import { seedDatabase } from '../data/seed';
import { Database, Cloud, Copy, Check, AlertCircle } from 'lucide-react';

const CSV_URL = '/JKLU_Student_Leadership_Selection_Sheet1___1_.csv';



export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'seeding' | 'done' | 'schema_needed' | 'error'>('idle');
  const [copiedSql, setCopiedSql] = useState(false);

  // Initialize and seed database on mount if needed
  useEffect(() => {
    async function init() {
      setSeedStatus('seeding');
      try {
        const count = await db.candidates.count();
        if (count > 0) {
          setSeedStatus('done');
          return;
        }

        // Try seeding candidates from CSV
        try {
          const response = await fetch(CSV_URL);
          if (response.ok) {
            const csvText = await response.text();
            await seedDatabase(csvText);
            setSeedStatus('done');
            return;
          }
        } catch {
          // If CSV fetch fails, seed default structure
          await seedDatabase();
          setSeedStatus('done');
          return;
        }

        setSeedStatus('done');
      } catch (err: any) {
        console.error('Initialization/Seed error:', err);
        // Check if tables don't exist yet
        if (err?.message?.includes('does not exist') || err?.code === '42P01') {
          setSeedStatus('schema_needed');
        } else {
          setSeedStatus('done');
        }
      }
    }
    init();
  }, []);

  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);
    if (!result.success) setError(result.error || 'Login failed.');
  }



  async function copySqlInstructions() {
    try {
      const response = await fetch('/supabase/schema.sql');
      const text = response.ok ? await response.text() : 'CREATE TABLE candidates (...);';
      await navigator.clipboard.writeText(text);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      setCopiedSql(true);
    }
  }

  return (
    <div className="min-h-screen bg-stone-75 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-80 bg-navy-700 text-white p-10 shrink-0">
        <div>
          <img src="/logo.png" alt="JKLU" className="w-10 h-10 object-contain mb-8 rounded" />
          <h1 className="font-display text-3xl leading-tight mb-4">
            JKLU Student Leadership Selection
          </h1>
          <p className="text-navy-300 text-sm leading-relaxed">
            Centralized selection management system for the 2026–27 leadership cycle. Live multi-evaluator collaboration.
          </p>
        </div>
        <div className="text-navy-400 text-xs flex items-center gap-1.5">
          <Cloud size={14} className="text-emerald-400" />
          <span>Connected to Centralized Cloud DB</span>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile header */}
          <div className="lg:hidden mb-8 text-center">
            <img src="/logo.png" alt="JKLU" className="w-10 h-10 mx-auto mb-3 rounded" />
            <h1 className="font-display text-2xl text-navy-700">JKLU Leadership Selection</h1>
          </div>

          <h2 className="text-lg font-semibold text-stone-800 mb-1">Sign in</h2>
          <p className="text-sm text-stone-500 mb-6">
            Access the centralized selection management system.
          </p>

          {/* Centralized database status */}
          <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-medium text-emerald-900">Centralized Cloud Backend</div>
                <div className="text-2xs text-emerald-700">Shared in real-time across all evaluators</div>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          </div>

          {/* Schema setup alert if tables not yet created in Supabase */}
          {seedStatus === 'schema_needed' && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-2">
              <div className="flex items-start gap-1.5 font-medium">
                <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <span>Supabase tables setup required:</span>
              </div>
              <p className="text-2xs text-amber-700 leading-normal">
                Paste <code className="font-mono bg-amber-100 px-1 rounded">supabase/schema.sql</code> into your Supabase SQL Editor to create tables.
              </p>
              <button
                type="button"
                onClick={copySqlInstructions}
                className="btn btn-secondary btn-sm w-full text-xs justify-center gap-1.5"
              >
                {copiedSql ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                {copiedSql ? 'Copied schema.sql' : 'Copy schema.sql to clipboard'}
              </button>
            </div>
          )}

          {/* Seeding indicator */}
          {seedStatus === 'seeding' && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Connecting to centralized database…
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@jklu.edu.in"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary btn w-full justify-center py-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
