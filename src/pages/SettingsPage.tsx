import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/shared/SharedComponents';
import type { SelectionCycle, Evaluator, UserRole } from '../types';
import { DEFAULT_RUBRIC_CRITERIA } from '../data/seed';
import { v4 as uuidv4 } from 'uuid';
import { Check, AlertTriangle, Key, Lock, Eye, EyeOff, ShieldCheck, Crown, Shield } from 'lucide-react';

export function SettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'Super Admin';
  const isAdminOrSuper = user?.role === 'Admin' || isSuperAdmin;

  const [cycle, setCycle] = useState<SelectionCycle | null>(null);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
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
    const [c, evs] = await Promise.all([
      db.selectionCycles.where('active').equals(1).first(),
      db.evaluators.toArray(),
    ]);
    setCycle(c || null);
    if (c) {
      setAppWeight(c.applicationWeight);
      setIntWeight(c.interviewWeight);
      setBlindEval(c.blindEvaluation);
    }
    setEvaluators(evs);
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
          { key: 'scoring' as const, label: 'Scoring Weights' },
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
          <div className="max-w-3xl space-y-6">
            <div className="card">
              <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                <div className="section-header mb-0">Committee Accounts & Evaluators</div>
                <div className="flex items-center gap-2">
                  {isSuperAdmin && (
                    <span className="badge bg-purple-50 text-purple-800 border-purple-200 text-2xs flex items-center gap-1">
                      <Crown size={10} /> Super Admin Mode
                    </span>
                  )}
                  <span className="text-xs text-stone-400 font-mono">{evaluators.length} members</span>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluators.map(ev => (
                      <tr key={ev.id}>
                        <td className="font-medium text-stone-800 flex items-center gap-1.5">
                          {ev.name}
                          {ev.id === user?.id && (
                            <span className="text-2xs font-normal text-navy-600 bg-navy-50 px-1.5 py-0.5 rounded border border-navy-200">You</span>
                          )}
                        </td>
                        <td className="text-xs text-stone-500 font-mono">{ev.email}</td>
                        <td>
                          {ev.role === 'Super Admin' ? (
                            <span className="badge bg-purple-50 text-purple-800 border-purple-200 text-2xs flex items-center gap-1 w-fit">
                              <Crown size={10} /> Super Admin
                            </span>
                          ) : ev.role === 'Admin' ? (
                            <span className="badge bg-amber-50 text-amber-800 border-amber-200 text-2xs flex items-center gap-1 w-fit">
                              <Shield size={10} /> Admin
                            </span>
                          ) : (
                            <span className="badge bg-blue-50 text-blue-800 border-blue-200 text-2xs">
                              {ev.role}
                            </span>
                          )}
                        </td>
                        <td>
                          {ev.active ? (
                            <span className="badge badge-selected text-2xs">Active</span>
                          ) : (
                            <span className="badge badge-rejected text-2xs">Inactive</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Super Admin can change password for anyone */}
                            {isSuperAdmin ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm text-xs text-navy-700"
                                onClick={() => {
                                  setSelectedEvaluatorForPass(ev);
                                  setAdminNewPass('');
                                  setAdminPassMsg('');
                                }}
                                title="Super Admin: Set new password for this account"
                              >
                                <Key size={12} /> Change Pass
                              </button>
                            ) : ev.id === user?.id ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm text-xs text-navy-700"
                                onClick={() => setActiveTab('security')}
                                title="Change your own password"
                              >
                                <Key size={12} /> My Password
                              </button>
                            ) : (
                              <span className="text-2xs text-stone-400 italic px-2">Managed by Super Admin</span>
                            )}

                            {/* Super Admin can activate/deactivate */}
                            {isSuperAdmin && ev.id !== user?.id && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm text-xs text-stone-500 hover:text-stone-800"
                                onClick={() => toggleEvaluator(ev.id, ev.active)}
                              >
                                {ev.active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                      <option value="Interviewer">Interviewer</option>
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

        {/* 5. Scoring Weights */}
        {activeTab === 'scoring' && cycle && isAdminOrSuper && (
          <div className="card p-6 max-w-sm space-y-4">
            <div>
              <label className="label">Application Score Weight (%)</label>
              <input
                type="number" min={0} max={100}
                className="input"
                value={appWeight}
                onChange={e => { const v = parseInt(e.target.value) || 0; setAppWeight(v); setIntWeight(100 - v); }}
              />
            </div>
            <div>
              <label className="label">Interview Score Weight (%)</label>
              <input
                type="number" min={0} max={100}
                className="input"
                value={intWeight}
                onChange={e => { const v = parseInt(e.target.value) || 0; setIntWeight(v); setAppWeight(100 - v); }}
              />
            </div>
            {appWeight + intWeight !== 100 && (
              <div className="flex items-center gap-2 text-amber-700 text-sm">
                <AlertTriangle size={13} /> Total must equal 100% (currently {appWeight + intWeight}%)
              </div>
            )}
            {savedMsg && <div className="text-sm text-green-600 flex items-center gap-1"><Check size={13} />{savedMsg}</div>}
            <button className="btn btn-primary" onClick={saveCycle} disabled={isSaving || appWeight + intWeight !== 100}>
              Save Weights
            </button>
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
