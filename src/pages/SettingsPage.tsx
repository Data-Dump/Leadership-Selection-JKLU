import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/shared/SharedComponents';
import type { SelectionCycle, Evaluator, UserRole } from '../types';
import { DEFAULT_RUBRIC_CRITERIA } from '../data/seed';
import { v4 as uuidv4 } from 'uuid';
import { Check, AlertTriangle, Key, Lock, Eye, EyeOff, ShieldCheck, Crown, Shield, Users, CheckCircle } from 'lucide-react';


export function SettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'Super Admin';
  const isAdminOrSuper = user?.role === 'Admin' || isSuperAdmin;

  const [cycle, setCycle] = useState<SelectionCycle | null>(null);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [evaluatorStats, setEvaluatorStats] = useState<Record<string, { completed: number; drafts: number; avgScore?: number }>>({});
  const [activeTab, setActiveTab] = useState<'security' | 'evaluators' | 'cycle' | 'rubric' | 'scoring'>('security');
  const [isSaving, setIsSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Cycle form
  const [appWeight, setAppWeight] = useState(70);
  const [intWeight, setIntWeight] = useState(30);
  const [blindEval, setBlindEval] = useState(false);

  // New evaluator form
  const [newEvalName, setNewEvalName] = useState('');
  const [newEvalEmail, setNewEvalEmail] = useState('');
  const [newEvalRole, setNewEvalRole] = useState<UserRole>('Evaluator');
  const [newEvalPass, setNewEvalPass] = useState('');

  // Self Change Password form
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  // Super Admin Change Password Modal for another evaluator
  const [selectedEvaluatorForPass, setSelectedEvaluatorForPass] = useState<Evaluator | null>(null);
  const [adminNewPass, setAdminNewPass] = useState('');
  const [adminPassMsg, setAdminPassMsg] = useState('');

  async function load() {
    const [c, evs, allEvals] = await Promise.all([
      db.selectionCycles.where('active').equals(1).first(),
      db.evaluators.toArray(),
      db.evaluations.toArray(),
    ]);
    setCycle(c || null);
    if (c) {
      setAppWeight(c.applicationWeight);
      setIntWeight(c.interviewWeight);
      setBlindEval(c.blindEvaluation);
    }
    setEvaluators(evs);

    // Compute stats per evaluator
    const stats: Record<string, { completed: number; drafts: number; avgScore?: number }> = {};
    evs.forEach(ev => {
      const myEvals = allEvals.filter(e => e.evaluatorId === ev.id);
      const completed = myEvals.filter(e => !e.isDraft);
      const drafts = myEvals.filter(e => e.isDraft);
      const avg = completed.length > 0
        ? Math.round(completed.reduce((acc, curr) => acc + curr.totalScore, 0) / completed.length)
        : undefined;
      stats[ev.id] = { completed: completed.length, drafts: drafts.length, avgScore: avg };
    });
    setEvaluatorStats(stats);
  }

  useEffect(() => { load(); }, []);


  async function handleSelfPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (!user) return;
    if (!currentPass) {
      setPassError('Please enter your current password.');
      return;
    }
    if (newPass.length < 6) {
      setPassError('New password must be at least 6 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassError('New passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const myRecord = await db.evaluators.get(user.id);
      if (!myRecord) {
        setPassError('User record not found.');
        setIsSaving(false);
        return;
      }

      // Check current password
      const storedPass = myRecord.passwordHash?.startsWith('demo:')
        ? myRecord.passwordHash.slice(5)
        : (myRecord.passwordHash || 'admin123');

      if (currentPass !== storedPass) {
        setPassError('Incorrect current password.');
        setIsSaving(false);
        return;
      }

      // Update password
      await db.evaluators.update(user.id, {
        passwordHash: newPass,
      });

      setPassSuccess('Your password has been updated successfully!');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => setPassSuccess(''), 4000);
    } catch (err: any) {
      setPassError(err.message || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSuperAdminSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isSuperAdmin || !selectedEvaluatorForPass) return;
    if (adminNewPass.length < 6) {
      setAdminPassMsg('Password must be at least 6 characters.');
      return;
    }

    setIsSaving(true);
    try {
      await db.evaluators.update(selectedEvaluatorForPass.id, {
        passwordHash: adminNewPass,
      });

      setAdminPassMsg('Password updated successfully for member!');
      setTimeout(() => {
        setSelectedEvaluatorForPass(null);
        setAdminNewPass('');
        setAdminPassMsg('');
      }, 1500);
      await load();
    } catch (err: any) {
      setAdminPassMsg(err.message || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCycle() {
    if (!cycle || !isAdminOrSuper) return;
    if (appWeight + intWeight !== 100) {
      alert('Application weight + interview weight must equal 100%.');
      return;
    }
    setIsSaving(true);
    await db.selectionCycles.update(cycle.id, {
      applicationWeight: appWeight,
      interviewWeight: intWeight,
      blindEvaluation: blindEval,
      updatedAt: Date.now(),
    });
    setSavedMsg('Settings saved');
    setTimeout(() => setSavedMsg(''), 2000);
    setIsSaving(false);
    await load();
  }

  async function addEvaluator() {
    if (!isSuperAdmin) return;
    if (!newEvalName || !newEvalEmail) return;
    const ev: Evaluator = {
      id: uuidv4(),
      name: newEvalName,
      email: newEvalEmail.toLowerCase(),
      role: newEvalRole,
      active: true,
      passwordHash: newEvalPass || 'admin123',
      createdAt: Date.now(),
    };
    await db.evaluators.add(ev);
    setNewEvalName('');
    setNewEvalEmail('');
    setNewEvalPass('');
    setNewEvalRole('Evaluator');
    await load();
  }

  async function toggleEvaluator(id: string, active: boolean) {
    if (!isSuperAdmin) return;
    await db.evaluators.update(id, { active: !active });
    await load();
  }

  const tabs = [
    { key: 'security', label: 'Change Password' },
    ...(isAdminOrSuper
      ? [
          { key: 'evaluators' as const, label: 'Committee & Evaluators' },
          { key: 'cycle' as const, label: 'Selection Cycle' },
          { key: 'rubric' as const, label: 'Default Rubric' },
        ]
      : []),
  ];


  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={
          isSuperAdmin
            ? 'Super Admin Control: Full system & password management'
            : user?.role === 'Admin'
            ? 'Admin Control: Committee settings & self-service password'
            : 'Account security & profile'
        }
      />
      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-stone-200">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                activeTab === tab.key ? 'border-navy-700 text-navy-700 font-medium' : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 1. Change Password Tab (Self-Service for currently logged-in user) */}
        {activeTab === 'security' && (
          <div className="max-w-md">
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={18} className="text-navy-700" />
                <h2 className="text-base font-semibold text-stone-800">Change Your Password</h2>
              </div>
              <p className="text-xs text-stone-500 mb-5">
                Update the password for your account (<span className="font-mono text-stone-700">{user?.email}</span>).
              </p>

              {passError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0 text-red-600" />
                  <span>{passError}</span>
                </div>
              )}

              {passSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-xs text-green-700 flex items-center gap-2">
                  <ShieldCheck size={14} className="shrink-0 text-green-600" />
                  <span>{passSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSelfPasswordChange} className="space-y-4">
                <div>
                  <label className="label" htmlFor="current-password">Current Password</label>
                  <div className="relative">
                    <input
                      id="current-password"
                      type={showCurrentPass ? 'text' : 'password'}
                      className="input pr-9"
                      value={currentPass}
                      onChange={e => setCurrentPass(e.target.value)}
                      placeholder="Enter current password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      {showCurrentPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="new-password">New Password</label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showNewPass ? 'text' : 'password'}
                      className="input pr-9"
                      value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="confirm-password">Confirm New Password</label>
                  <input
                    id="confirm-password"
                    type={showNewPass ? 'text' : 'password'}
                    className="input"
                    value={confirmPass}
                    onChange={e => setConfirmPass(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full justify-center py-2 text-sm mt-2"
                  disabled={isSaving}
                >
                  <Key size={14} />
                  {isSaving ? 'Updating Password…' : 'Update Password'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 2. Evaluators & Committee Members */}
        {activeTab === 'evaluators' && isAdminOrSuper && (
          <div className="space-y-6">
            {/* Top Summary & Cloud Sync Banner */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <Users size={18} />
                </div>
                <div>
                  <div className="text-xl font-bold font-mono text-stone-800">{evaluators.length}</div>
                  <div className="text-2xs text-stone-500">Total Registered Members</div>
                </div>
              </div>

              <div className="card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle size={18} />
                </div>
                <div>
                  <div className="text-xl font-bold font-mono text-emerald-700">
                    {evaluators.filter(e => e.active).length}
                  </div>
                  <div className="text-2xs text-stone-500">Active Evaluators</div>
                </div>
              </div>

              <div className="card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <Crown size={18} />
                </div>
                <div>
                  <div className="text-xl font-bold font-mono text-purple-700">
                    {evaluators.filter(e => e.role === 'Super Admin' || e.role === 'Admin').length}
                  </div>
                  <div className="text-2xs text-stone-500">Administrators</div>
                </div>
              </div>

              <div className="card p-4 flex items-center gap-3 bg-emerald-50/60 border-emerald-200">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-emerald-900">Cloud Sync (Live)</div>
                  <div className="text-2xs text-emerald-700">Dynamic evaluator pool</div>
                </div>
              </div>
            </div>

            {/* Main Table Card */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-3 bg-white">
                <div>
                  <h2 className="font-semibold text-stone-800 text-sm">Active Panel Evaluators & Committee</h2>
                  <p className="text-2xs text-stone-500 mt-0.5">
                    Centralized evaluator database · Evaluators auto-register upon entering their name
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isSuperAdmin && (
                    <span className="badge bg-purple-50 text-purple-800 border-purple-200 text-2xs flex items-center gap-1">
                      <Crown size={10} /> Super Admin Control
                    </span>
                  )}
                </div>
              </div>

              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-600 text-xs font-semibold">
                    <th className="py-3 px-4">Member Details</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {evaluators.map(ev => {
                    const isAutoRegistered = ev.email.endsWith('@jklu.evaluator');

                    return (
                      <tr key={ev.id} className="hover:bg-stone-50/80 transition-colors">
                        {/* Member Name + Email */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-stone-800 text-sm">{ev.name}</span>
                            {ev.id === user?.id && (
                              <span className="text-2xs font-semibold text-navy-700 bg-navy-50 px-1.5 py-0.5 rounded border border-navy-200">
                                You
                              </span>
                            )}
                            {isAutoRegistered && (
                              <span className="text-2xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                Dynamic Panel
                              </span>
                            )}
                          </div>
                          <div className="text-stone-400 font-mono text-2xs mt-0.5 truncate max-w-xs">
                            {ev.email}
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-3 px-4">
                          {ev.role === 'Super Admin' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-2xs font-semibold">
                              <Crown size={10} /> Super Admin
                            </span>
                          ) : ev.role === 'Admin' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-2xs font-semibold">
                              <Shield size={10} /> Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-2xs font-medium">
                              {ev.role}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          {ev.active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-2xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200 text-2xs font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                              Inactive
                            </span>
                          )}
                        </td>


                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isSuperAdmin ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm text-xs py-1 px-2.5 gap-1"
                                onClick={() => {
                                  setSelectedEvaluatorForPass(ev);
                                  setAdminNewPass('');
                                  setAdminPassMsg('');
                                }}
                                title="Super Admin: Set new password for this account"
                              >
                                <Key size={11} />
                                <span>Reset Pass</span>
                              </button>
                            ) : ev.id === user?.id ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm text-xs py-1 px-2.5 gap-1"
                                onClick={() => setActiveTab('security')}
                                title="Change your own password"
                              >
                                <Key size={11} />
                                <span>My Password</span>
                              </button>
                            ) : null}

                            {isSuperAdmin && ev.id !== user?.id && (
                              <button
                                type="button"
                                className={`btn btn-sm text-xs py-1 px-2.5 ${
                                  ev.active
                                    ? 'btn-ghost text-stone-500 hover:text-red-600 hover:bg-red-50'
                                    : 'btn-secondary text-emerald-700 hover:bg-emerald-50'
                                }`}
                                onClick={() => toggleEvaluator(ev.id, ev.active)}
                              >
                                {ev.active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>


            {/* Add new committee member (Super Admin Only) */}
            {isSuperAdmin ? (
              <div className="card p-5 max-w-xl">
                <div className="section-header flex items-center justify-between">
                  <span>Add Committee Member</span>
                  <span className="text-2xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    Super Admin Privilege
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Full Name</label>
                    <input className="input" value={newEvalName} onChange={e => setNewEvalName(e.target.value)} placeholder="e.g. Rahul Verma" />
                  </div>
                  <div>
                    <label className="label">Email Address</label>
                    <input className="input" type="email" value={newEvalEmail} onChange={e => setNewEvalEmail(e.target.value)} placeholder="email@jklu.edu.in" />
                  </div>
                  <div>
                    <label className="label">Role</label>
                    <select className="input" value={newEvalRole} onChange={e => setNewEvalRole(e.target.value as any)}>
                      <option value="Super Admin">Super Admin</option>
                      <option value="Admin">Admin</option>
                      <option value="Evaluator">Evaluator</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Initial Password</label>
                    <input className="input" type="password" value={newEvalPass} onChange={e => setNewEvalPass(e.target.value)} placeholder="Default: admin123" />
                  </div>
                </div>
                <button className="btn btn-primary mt-3" onClick={addEvaluator} disabled={!newEvalName || !newEvalEmail}>
                  Add Member
                </button>
              </div>
            ) : (
              <div className="p-4 bg-stone-50 border border-stone-200 rounded text-xs text-stone-600 flex items-center gap-2">
                <Shield size={14} className="text-amber-600 shrink-0" />
                <span>Admin View: You can view committee members. Only Super Admins can add members or reset credentials for other users.</span>
              </div>
            )}
          </div>
        )}

        {/* 3. Cycle Settings */}
        {activeTab === 'cycle' && cycle && isAdminOrSuper && (
          <div className="card p-6 max-w-md space-y-4">
            <div>
              <div className="label">Cycle Name</div>
              <div className="text-sm text-stone-700">{cycle.name}</div>
            </div>
            <div>
              <div className="label">Academic Year</div>
              <div className="text-sm text-stone-700">{cycle.academicYear}</div>
            </div>
            <div>
              <label className="label flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blindEval}
                  onChange={e => setBlindEval(e.target.checked)}
                  className="accent-navy-700"
                />
                Enable Blind Evaluation
              </label>
              <div className="text-xs text-stone-400 mt-1">
                When enabled, evaluators see application responses but not the candidate's name, photo, or contact details.
              </div>
            </div>
            {savedMsg && <div className="text-sm text-green-600 flex items-center gap-1"><Check size={13} />{savedMsg}</div>}
            <button className="btn btn-primary" onClick={saveCycle} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        )}

        {/* 4. Default Rubric */}
        {activeTab === 'rubric' && isAdminOrSuper && (
          <div className="card p-5 max-w-2xl">
            <div className="section-header">Default Evaluation Rubric</div>
            <div className="text-xs text-stone-400 mb-4">
              Total weight must equal 100%. Criterion weights: {DEFAULT_RUBRIC_CRITERIA.reduce((s, c) => s + c.weight, 0)}%
            </div>
            <div className="space-y-3">
              {DEFAULT_RUBRIC_CRITERIA.map(c => (
                <div key={c.id} className="border border-stone-100 rounded p-3">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-sm text-stone-800">{c.name}</span>
                    <span className="text-sm text-stone-500 font-mono">{c.weight}%</span>
                  </div>
                  <div className="text-xs text-stone-400">{c.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>


      {/* Super Admin Password Change Modal for a Member */}
      {selectedEvaluatorForPass && isSuperAdmin && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setSelectedEvaluatorForPass(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-stone-200 rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-purple-700" />
                <h3 className="font-semibold text-stone-800 text-sm">Super Admin: Reset Member Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvaluatorForPass(null)}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSuperAdminSetPassword} className="p-5 space-y-4">
              <div>
                <div className="text-xs text-stone-500 mb-1">Target Account</div>
                <div className="p-2.5 bg-stone-50 border border-stone-200 rounded flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-stone-800">{selectedEvaluatorForPass.name}</div>
                    <div className="text-2xs text-stone-500 font-mono">{selectedEvaluatorForPass.email}</div>
                  </div>
                  <span className={`badge text-2xs ${selectedEvaluatorForPass.role === 'Super Admin' ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                    {selectedEvaluatorForPass.role}
                  </span>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="admin-new-password">New Password</label>
                <input
                  id="admin-new-password"
                  type="text"
                  className="input font-mono"
                  value={adminNewPass}
                  onChange={e => setAdminNewPass(e.target.value)}
                  placeholder="Enter new password (min 6 chars)"
                  required
                  minLength={6}
                  autoFocus
                />
              </div>

              {adminPassMsg && (
                <div className={`p-2.5 rounded text-xs flex items-center gap-1.5 ${adminPassMsg.includes('success') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {adminPassMsg.includes('success') ? <Check size={13} /> : <AlertTriangle size={13} />}
                  <span>{adminPassMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedEvaluatorForPass(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm bg-purple-700 hover:bg-purple-800"
                  disabled={isSaving || adminNewPass.length < 6}
                >
                  {isSaving ? 'Saving…' : 'Update User Password'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
