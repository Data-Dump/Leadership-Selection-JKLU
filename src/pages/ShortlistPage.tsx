import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { setApplicationStatus } from '../data/audit';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, StatusBadge, ScoreDisplay, ConfirmDialog, EmptyState } from '../components/shared/SharedComponents';
import { calculateAverageScore, hasSignificantDisagreement } from '../scoring/engine';
import type { Application, Candidate, Evaluation, Track } from '../types';
import { AlertTriangle, Calendar } from 'lucide-react';

interface ShortlistRow {
  application: Application;
  candidate: Candidate;
  evaluations: Evaluation[];
  avgScore?: number;
  hasDisagreement: boolean;
}

const TABS: Array<{ key: 'all' | Track; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Student Council', label: 'Student Council' },
  { key: 'Club Leadership', label: 'Club Leadership' },
  { key: 'Coordinator', label: 'Coordinator' },
];

export function ShortlistPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ShortlistRow[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | Track>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    const [applications, candidates, evaluations] = await Promise.all([
      db.applications.where('status').anyOf(['Shortlisted', 'Interview']).toArray(),
      db.candidates.toArray(),
      db.evaluations.filter(e => !e.isDraft).toArray(),
    ]);
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    const data: ShortlistRow[] = applications
      .filter(a => candidateMap.has(a.candidateId))
      .map(app => {
        const evals = evaluations.filter(e => e.applicationId === app.id);
        return {
          application: app,
          candidate: candidateMap.get(app.candidateId)!,
          evaluations: evals,
          avgScore: calculateAverageScore(evals),
          hasDisagreement: hasSignificantDisagreement(evals),
        };
      });

    setRows(data);
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = activeTab === 'all' ? rows : rows.filter(r => r.application.track === activeTab);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.application.id)));
  }

  async function bulkAction(action: string) {
    if (!user) return;
    const statusMap: Record<string, string> = {
      interview: 'Interview',
      hold: 'Hold',
      reject: 'Rejected',
    };
    for (const appId of selected) {
      await setApplicationStatus(appId, statusMap[action], user.id, user.name);
    }
    setSelected(new Set());
    setConfirmBulk(null);
    await load();
  }

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader
        title="Shortlist"
        subtitle={`${rows.length} shortlisted candidates`}
      />
      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-stone-200">
          {TABS.map(tab => {
            const count = tab.key === 'all' ? rows.length : rows.filter(r => r.application.track === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as never)}
                className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? 'border-navy-700 text-navy-700 font-medium'
                    : 'border-transparent text-stone-500 hover:text-stone-700'
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-navy-50 border border-navy-200 rounded text-sm">
            <span className="font-medium text-navy-700">{selected.size} selected</span>
            <button className="btn btn-sm btn-secondary" onClick={() => setConfirmBulk('interview')}>
              <Calendar size={12} /> Move to Interview
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => setConfirmBulk('hold')}>
              Hold
            </button>
            <button
              className="btn btn-sm"
              style={{ color: '#B91C1C', borderColor: '#FCA5A5', background: 'transparent' }}
              onClick={() => setConfirmBulk('reject')}
            >
              Reject
            </button>
            <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            title="No shortlisted candidates"
            description="Shortlist candidates from the Applications or Candidate Profile pages."
          />
        ) : (
          <div className="card">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleSelectAll}
                        className="accent-navy-700"
                      />
                    </th>
                    <th>Candidate</th>
                    <th>Position</th>
                    <th>Status</th>
                    <th>Evaluators</th>
                    <th>Avg Score</th>
                    <th>Disagreement</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.application.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(row.application.id)}
                          onChange={() => toggleSelect(row.application.id)}
                          className="accent-navy-700"
                        />
                      </td>
                      <td>
                        <Link to={`/candidates/${row.candidate.id}`} className="font-medium text-navy-700 hover:underline">
                          {row.candidate.fullName}
                        </Link>
                        <div className="text-xs text-stone-400">{row.candidate.rollNumber}</div>
                      </td>
                      <td>
                        <div className="text-sm">{row.application.position}</div>
                        {row.application.club && <div className="text-xs text-stone-400">{row.application.club}</div>}
                      </td>
                      <td><StatusBadge status={row.application.status} /></td>
                      <td className="text-center font-mono text-sm">{row.evaluations.length}</td>
                      <td><ScoreDisplay score={row.avgScore} size="sm" /></td>
                      <td>
                        {row.hasDisagreement ? (
                          <span className="flex items-center gap-1 text-amber-600 text-xs">
                            <AlertTriangle size={12} /> Significant
                          </span>
                        ) : (
                          <span className="text-stone-300 text-xs">—</span>
                        )}
                      </td>
                      <td>
                        <Link to={`/candidates/${row.candidate.id}`} className="btn btn-ghost btn-sm">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {confirmBulk && (
        <ConfirmDialog
          title={confirmBulk === 'reject' ? 'Reject Selected' : 'Confirm Bulk Action'}
          message={`This will update ${selected.size} application${selected.size !== 1 ? 's' : ''}. Are you sure?`}
          confirmLabel={confirmBulk === 'reject' ? 'Reject All' : 'Confirm'}
          danger={confirmBulk === 'reject'}
          onConfirm={() => bulkAction(confirmBulk)}
          onCancel={() => setConfirmBulk(null)}
        />
      )}
    </div>
  );
}
