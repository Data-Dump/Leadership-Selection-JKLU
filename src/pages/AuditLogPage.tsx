import { useEffect, useState, useMemo } from 'react';
import { db } from '../data/db';
import { PageHeader, EmptyState } from '../components/shared/SharedComponents';
import type { AuditEntry, AuditAction } from '../types';
import { format } from 'date-fns';
import { Search, Shield, LogIn, Filter } from 'lucide-react';

const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'User Login',
  logout: 'User Logout',
  imported: 'Data Imported',
  shortlisted: 'Shortlisted',
  held: 'Put on Hold',
  rejected: 'Rejected',
  selected: 'Selected',
  waitlisted: 'Waitlisted',
  evaluation_submitted: 'Evaluation Submitted',
  evaluation_updated: 'Evaluation Updated',
  final_decision: 'Final Decision',
  note_added: 'Note Added',
  status_changed: 'Status Changed',
};

const ACTION_COLORS: Record<AuditAction, string> = {
  login: 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold',
  logout: 'bg-stone-100 text-stone-600 border border-stone-200',
  imported: 'bg-blue-50 text-blue-700 border border-blue-200',
  shortlisted: 'bg-amber-50 text-amber-800 border border-amber-200',
  held: 'bg-orange-50 text-orange-800 border border-orange-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
  selected: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  waitlisted: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
  evaluation_submitted: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  evaluation_updated: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  final_decision: 'bg-navy-50 text-navy-800 border border-navy-200 font-semibold',
  note_added: 'bg-stone-50 text-stone-700 border border-stone-200',
  status_changed: 'bg-stone-50 text-stone-700 border border-stone-200',
};

type FilterCategory = 'all' | 'logins' | 'evaluations' | 'decisions' | 'imports';

const PAGE_SIZE = 50;

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [category, setCategory] = useState<FilterCategory>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    db.auditLog.orderBy('timestamp').reverse().toArray().then(data => {
      setEntries(data);
      setIsLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      // Category filter
      if (category === 'logins' && e.action !== 'login' && e.action !== 'logout') return false;
      if (category === 'evaluations' && e.action !== 'evaluation_submitted' && e.action !== 'evaluation_updated') return false;
      if (category === 'decisions' && !['final_decision', 'selected', 'shortlisted', 'waitlisted', 'rejected', 'held'].includes(e.action)) return false;
      if (category === 'imports' && e.action !== 'imported') return false;

      // Text search
      if (query.trim()) {
        const q = query.toLowerCase();
        const matchesUser = e.userName?.toLowerCase().includes(q);
        const matchesDetails = e.details?.toLowerCase().includes(q);
        const matchesCandidate = e.candidateName?.toLowerCase().includes(q);
        const matchesAction = (ACTION_LABELS[e.action] || e.action).toLowerCase().includes(q);
        return matchesUser || matchesDetails || matchesCandidate || matchesAction;
      }
      return true;
    });
  }, [entries, category, query]);

  const displayed = filtered.slice(0, page * PAGE_SIZE);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle={`${entries.length} security & activity events recorded in centralized cloud audit`}
      />

      <div className="p-6 space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-stone-200">
          {/* Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-xs text-stone-400 font-medium mr-1 flex items-center gap-1">
              <Filter size={12} /> Filter:
            </span>
            {[
              { key: 'all' as const, label: 'All Activities' },
              { key: 'logins' as const, label: 'Logins & Access' },
              { key: 'evaluations' as const, label: 'Evaluations' },
              { key: 'decisions' as const, label: 'Decisions' },
              { key: 'imports' as const, label: 'Imports' },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setCategory(tab.key); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  category === tab.key
                    ? 'bg-navy-700 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" size={13} />
            <input
              type="text"
              placeholder="Search user, candidate, or action…"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-navy-600"
            />
          </div>
        </div>

        {entries.length === 0 ? (
          <EmptyState title="No audit entries" description="Actions will be recorded here as you use the system." />
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center text-stone-400 text-xs">
            No audit records match the current filter.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Candidate</th>
                    <th>Position</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(entry => (
                    <tr key={entry.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="text-xs font-mono text-stone-500 whitespace-nowrap">
                        {format(new Date(entry.timestamp), 'dd MMM yyyy HH:mm:ss')}
                      </td>
                      <td className="text-sm font-medium text-stone-800 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {entry.action === 'login' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          )}
                          <span>{entry.userName}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge text-2xs ${ACTION_COLORS[entry.action] || 'bg-stone-50 text-stone-600'}`}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                      </td>
                      <td className="text-sm text-stone-700">{entry.candidateName || '—'}</td>
                      <td className="text-sm text-stone-500">{entry.position || '—'}</td>
                      <td className="text-xs text-stone-600 max-w-md font-mono">{entry.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {displayed.length < filtered.length && (
              <div className="px-4 py-3 border-t border-stone-100 bg-stone-50/50 text-center">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm text-xs"
                  onClick={() => setPage(p => p + 1)}
                >
                  Load More ({filtered.length - displayed.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
