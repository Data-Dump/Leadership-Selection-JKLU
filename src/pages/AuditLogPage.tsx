import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { PageHeader, EmptyState } from '../components/shared/SharedComponents';
import type { AuditEntry, AuditAction } from '../types';
import { format } from 'date-fns';

const ACTION_LABELS: Record<AuditAction, string> = {
  imported: 'Imported',
  shortlisted: 'Shortlisted',
  held: 'Put on Hold',
  rejected: 'Rejected',
  moved_to_interview: 'Moved to Interview',
  selected: 'Selected',
  waitlisted: 'Waitlisted',
  evaluation_submitted: 'Evaluation Submitted',
  evaluation_updated: 'Evaluation Updated',
  interview_recorded: 'Interview Recorded',
  final_decision: 'Final Decision',
  note_added: 'Note Added',
  status_changed: 'Status Changed',
};

const ACTION_COLORS: Record<AuditAction, string> = {
  imported: 'bg-blue-50 text-blue-700',
  shortlisted: 'bg-amber-50 text-amber-700',
  held: 'bg-orange-50 text-orange-700',
  rejected: 'bg-red-50 text-red-700',
  moved_to_interview: 'bg-purple-50 text-purple-700',
  selected: 'bg-green-50 text-green-700',
  waitlisted: 'bg-yellow-50 text-yellow-700',
  evaluation_submitted: 'bg-blue-50 text-blue-700',
  evaluation_updated: 'bg-blue-50 text-blue-700',
  interview_recorded: 'bg-purple-50 text-purple-700',
  final_decision: 'bg-navy-50 text-navy-700',
  note_added: 'bg-stone-50 text-stone-700',
  status_changed: 'bg-stone-50 text-stone-700',
};

const PAGE_SIZE = 50;

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    db.auditLog.orderBy('timestamp').reverse().toArray().then(data => {
      setEntries(data);
      setIsLoading(false);
    });
  }, []);

  const displayed = entries.slice(0, page * PAGE_SIZE);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader title="Audit Log" subtitle={`${entries.length} actions recorded`} />
      <div className="p-6">
        {entries.length === 0 ? (
          <EmptyState title="No audit entries" description="Actions will be recorded here as you use the system." />
        ) : (
          <div className="card">
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
                    <tr key={entry.id}>
                      <td className="text-xs font-mono text-stone-500 whitespace-nowrap">
                        {format(new Date(entry.timestamp), 'dd MMM yyyy HH:mm')}
                      </td>
                      <td className="text-sm text-stone-700">{entry.userName}</td>
                      <td>
                        <span className={`badge text-2xs ${ACTION_COLORS[entry.action] || 'bg-stone-50 text-stone-600'}`}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                      </td>
                      <td className="text-sm text-stone-700">{entry.candidateName || '—'}</td>
                      <td className="text-sm text-stone-500">{entry.position || '—'}</td>
                      <td className="text-xs text-stone-400 max-w-xs truncate">{entry.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {displayed.length < entries.length && (
              <div className="px-4 py-3 border-t text-center">
                <button className="btn btn-ghost text-sm" onClick={() => setPage(p => p + 1)}>
                  Load more ({entries.length - displayed.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
