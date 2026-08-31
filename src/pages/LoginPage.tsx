import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../data/db';
import { seedDatabase } from '../data/seed';
import type { Evaluator } from '../types';
import {
  Database,
  Cloud,
  Copy,
  Check,
  AlertCircle,
  Award,
  UserCheck,
  Shield,
  ArrowRight,
  Key,
  Lock,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';

const CSV_URL = '/JKLU_Student_Leadership_Selection_Sheet1___1_.csv';

export function LoginPage() {
  const { user, login, evaluatorLogin } = useAuth();
  const [activeTab, setActiveTab] = useState<'evaluator' | 'admin'>('evaluator');

  // Evaluator mode state
  const [evaluatorName, setEvaluatorName] = useState('');
  const [evaluatorEmail, setEvaluatorEmail] = useState('');

  // Admin mode state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Registered admins
  const [evaluatorTabAdmins, setEvaluatorTabAdmins] = useState<Evaluator[]>([]);
  const [selectedAdminForPass, setSelectedAdminForPass] = useState<Evaluator | null>(null);
  const [adminModalPass, setAdminModalPass] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [modalError, setModalError] = useState('');

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
        if (count === 0) {
          try {
            const response = await fetch(CSV_URL);
            if (response.ok) {
              const csvText = await response.text();
              await seedDatabase(csvText);
            } else {
              await seedDatabase();
            }
          } catch {
            await seedDatabase();
          }
        }

        const evals = await db.evaluators.toArray();
        // Evaluator tab: only regular admins without Kaushal
        const evalAdmins = evals.filter(
          e => e.active &&
               e.role === 'Admin' &&
               !e.name.toLowerCase().includes('kaushal') &&
               !e.email.toLowerCase().includes('kaushal')
        );
        setEvaluatorTabAdmins(evalAdmins);

        setSeedStatus('done');
      } catch (err: any) {
        console.error('Initialization/Seed error:', err);
        if (err?.message?.includes('does not exist') || err?.code === '42P01') {
          setSeedStatus('schema_needed');
        } else {
          setSeedStatus('done');
        }
      }
    }
    init();
  }, []);


  if (user) {
    if (user.role === 'Evaluator') {
      return <Navigate to="/evaluator/dashboard" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  async function handleEvaluatorSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = evaluatorName.trim();
    if (!trimmed) {
      setError('Please enter your name.');
      return;
    }

    const enteredLower = trimmed.toLowerCase();
    const enteredFirstName = enteredLower.split(/\s+/)[0];

    // Check if entered name or first name matches any registered Admin or Super Admin
    const allEvals = await db.evaluators.toArray();
    const matchingAdmin = allEvals.find(a => {
      if (!a.active || (a.role !== 'Super Admin' && a.role !== 'Admin')) return false;
      const adminNameLower = a.name.toLowerCase();
      const adminFirstName = adminNameLower.split(/\s+/)[0];
      const adminEmailLower = a.email.toLowerCase();

      // Check full name, first name, or email
      return (
        adminNameLower === enteredLower ||
        adminFirstName === enteredFirstName ||
        (enteredFirstName.length >= 3 && adminNameLower.includes(enteredFirstName)) ||
        (evaluatorEmail.trim() && adminEmailLower === evaluatorEmail.trim().toLowerCase())
      );
    });

    if (matchingAdmin) {
      setSelectedAdminForPass(matchingAdmin);
      setAdminModalPass('');
      setModalError('');
      return;
    }

    setError('');
    setIsSubmitting(true);
    const result = await evaluatorLogin(trimmed, evaluatorEmail.trim() || undefined);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Could not sign in as evaluator.');
    }
  }


  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);
    if (!result.success) setError(result.error || 'Login failed.');
  }

  async function handleModalAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAdminForPass) return;
    setModalError('');
    setIsSubmitting(true);
    const result = await login(selectedAdminForPass.email, adminModalPass);
    setIsSubmitting(false);
    if (!result.success) {
      setModalError(result.error || 'Incorrect password.');
    } else {
      setSelectedAdminForPass(null);
    }
  }

  function handleQuickSelectAdmin(admin: Evaluator) {
    setSelectedAdminForPass(admin);
    setAdminModalPass('');
    setModalError('');
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
      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-96 bg-navy-700 text-white p-10 shrink-0">
        <div>
          <img src="/jklu_white.png" alt="JKLU Logo" className="h-16 w-auto object-contain mb-8 drop-shadow-sm" />
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-navy-600/80 border border-navy-500 text-amber-300 text-xs font-medium mb-4">
            <Award size={13} />
            <span>Evaluator Portal Access</span>
          </div>
          <h1 className="font-display text-3xl leading-tight mb-4">
            JKLU Student Leadership Selection
          </h1>
          <p className="text-navy-300 text-sm leading-relaxed mb-6">
            Centralized selection and evaluation system for the 2026–27 student council, club leaders, and coordinators.
          </p>
          <div className="space-y-3 text-xs text-navy-200">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Multi-evaluator live synchronization</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>Standardized rubrics & automatic weighting</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Seamless candidate-by-candidate scoring</span>
            </div>
          </div>
        </div>
        <div className="text-navy-400 text-xs flex items-center gap-1.5 pt-6 border-t border-navy-600">
          <Cloud size={14} className="text-emerald-400" />
          <span>Connected to Centralized Cloud DB</span>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <div className="lg:hidden mb-6 text-center">
            <img src="/jklu_white.png" alt="JKLU Logo" className="h-14 w-auto mx-auto mb-3 object-contain bg-navy-700 p-2 rounded-lg" />
            <h1 className="font-display text-2xl text-navy-700">JKLU Leadership Selection</h1>
            <p className="text-xs text-stone-500 mt-1">2026–27 Selection Cycle</p>
          </div>

          {/* Tab Switcher */}
          <div className="flex p-1 bg-stone-200 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => { setActiveTab('evaluator'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'evaluator'
                  ? 'bg-white text-navy-800 shadow-sm'
                  : 'text-stone-600 hover:text-navy-700'
              }`}
            >
              <UserCheck size={14} />
              <span>Evaluator Access</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('admin'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'admin'
                  ? 'bg-white text-navy-800 shadow-sm'
                  : 'text-stone-600 hover:text-navy-700'
              }`}
            >
              <Shield size={14} />
              <span>Admin Login</span>
            </button>
          </div>

          {/* Centralized database status */}
          <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-medium text-emerald-900">Centralized Cloud Backend (Live)</div>
                <div className="text-2xs text-emerald-700">Evaluations sync in real time across the panel</div>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          </div>

          {/* Schema setup alert if tables not yet created in Supabase */}
          {seedStatus === 'schema_needed' && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-2">
              <div className="flex items-start gap-1.5 font-medium">
                <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <span>Supabase tables setup required:</span>
              </div>
              <p className="text-2xs text-amber-700 leading-normal">
                Paste <code className="font-mono bg-amber-100 px-1 rounded">supabase/schema.sql</code> into your Supabase SQL Editor.
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
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Connecting to centralized database…
            </div>
          )}

          {activeTab === 'evaluator' ? (
            /* Evaluator Mode: Fast Name Login */
            <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-stone-800">Evaluator Panel Access</h2>
                <p className="text-xs text-stone-500 mt-1">
                  Enter your name to begin reviewing and scoring assigned candidates.
                </p>
              </div>

              <form onSubmit={handleEvaluatorSubmit} className="space-y-4">
                <div>
                  <label className="label text-xs" htmlFor="evaluatorName">
                    Your Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="evaluatorName"
                    type="text"
                    className="input text-sm"
                    value={evaluatorName}
                    onChange={e => setEvaluatorName(e.target.value)}
                    placeholder="e.g. Dr. Amit Sharma or Prof. Priya Verma"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="label text-xs" htmlFor="evaluatorEmail">
                    Email address <span className="text-stone-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="evaluatorEmail"
                    type="email"
                    className="input text-sm"
                    value={evaluatorEmail}
                    onChange={e => setEvaluatorEmail(e.target.value)}
                    placeholder="your.name@jklu.edu.in"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary btn w-full justify-center py-2.5 text-sm gap-2 font-medium"
                  disabled={isSubmitting}
                >
                  <span>{isSubmitting ? 'Entering Panel…' : 'Begin Evaluating'}</span>
                  <ArrowRight size={15} />
                </button>
              </form>

              {/* Or select registered admin (excluding Super Admin) */}
              {evaluatorTabAdmins.length > 0 && (
                <div className="mt-4 pt-4 border-t border-stone-100">
                  <div className="text-2xs text-stone-400 mb-2">Or select registered admin:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {evaluatorTabAdmins.map(admin => {
                      const trimmedInput = evaluatorName.trim().toLowerCase();
                      const isMatching =
                        trimmedInput.length >= 2 &&
                        (admin.name.toLowerCase().startsWith(trimmedInput) ||
                         admin.name.toLowerCase().split(/\s+/)[0] === trimmedInput);

                      return (
                        <button
                          key={admin.id}
                          type="button"
                          onClick={() => handleQuickSelectAdmin(admin)}
                          className={`px-2.5 py-1 rounded text-xs transition-all font-medium ${
                            isMatching
                              ? 'bg-navy-100 text-navy-900 border border-navy-400 font-semibold shadow-xs ring-1 ring-navy-300'
                              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                          }`}
                        >
                          {admin.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          ) : (
            /* Admin Mode: Email & Password */
            <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-stone-800">Admin Sign In</h2>
                <p className="text-xs text-stone-500 mt-1">
                  Access candidate shortlisting, final selection, and cycle settings.
                </p>
              </div>




              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <label className="label text-xs" htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    className="input text-sm"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@jklu.edu.in"
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="label text-xs" htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    className="input text-sm"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary btn w-full justify-center py-2 text-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Signing in…' : 'Sign in as Admin'}
                </button>
              </form>
            </div>
          )}

          <div className="mt-6 text-center text-stone-400 text-xs">
            JKLU Student Leadership Selection 2026–27 · Secure Portal
          </div>
        </div>
      </div>

      {/* Password Popup Modal for Existing Admin Selection */}
      {selectedAdminForPass && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-navy-100 text-navy-800 flex items-center justify-center">
                  <Key size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-stone-800 text-sm">Enter Password</h3>
                  <p className="text-2xs text-stone-500">Verify administrator identity</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAdminForPass(null)}
                className="btn btn-ghost btn-sm p-1"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleModalAdminLogin} className="p-5 space-y-4">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center gap-2.5">
                <Shield size={16} className="text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-stone-800 truncate">
                    {selectedAdminForPass.name}
                  </div>
                  <div className="text-2xs text-stone-500 font-mono truncate">
                    {selectedAdminForPass.email}
                  </div>
                </div>
                <span className="badge text-3xs bg-amber-50 text-amber-700 border-amber-200">
                  {selectedAdminForPass.role}
                </span>
              </div>

              <div>
                <label className="label text-xs" htmlFor="modal-admin-pass">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="modal-admin-pass"
                    type={showAdminPass ? 'text' : 'password'}
                    className="input text-sm pr-9"
                    value={adminModalPass}
                    onChange={e => setAdminModalPass(e.target.value)}
                    placeholder="Enter password"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPass(prev => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    {showAdminPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {modalError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {modalError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedAdminForPass(null)}
                  className="btn btn-secondary btn-sm flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm flex-1 justify-center gap-1.5 font-medium"
                  disabled={isSubmitting || !adminModalPass}
                >
                  <Lock size={12} />
                  <span>{isSubmitting ? 'Verifying…' : 'Sign In'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
