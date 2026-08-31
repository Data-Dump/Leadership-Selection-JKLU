import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { PageHeader, StatusBadge, TrackBadge, ScoreDisplay, EmptyState } from '../components/shared/SharedComponents';
import { calculateAverageScore, hasSignificantDisagreement } from '../scoring/engine';
import { comparePositions } from '../utils/positionHierarchy';
import { useDebounce } from '../hooks/useDebounce';
import Fuse from 'fuse.js';
import type { Application, Candidate, Evaluation, ApplicationStatus, Track } from '../types';
import { AlertTriangle, X, Filter } from 'lucide-react';
import { EvaluationPanel } from '../components/evaluation/EvaluationPanel';

interface AppRow {
  application: Application;
  candidate: Candidate;
  evaluations: Evaluation[];
  avgScore?: number;
  hasDisagreement: boolean;
}

const STATUSES: ApplicationStatus[] = [
  'Pending Review', 'Under Review', 'Shortlisted', 'Interview', 'Selected', 'Waitlisted', 'Hold', 'Rejected'
];
const TRACKS: Track[] = ['Student Council', 'Club Leadership', 'Coordinator'];

export function ApplicationsPage() {
  const [rows, setRows] = useState<AppRow[]>([]);
  const [filtered, setFiltered] = useState<AppRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [evalAppId, setEvalAppId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 250);

  async function load() {
    const [applications, candidates, evaluations] = await Promise.all([
      db.applications.toArray(),
      db.candidates.toArray(),
      db.evaluations.toArray(),
    ]);
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    const appRows: AppRow[] = applications.map(app => {
      const appEvals = evaluations.filter(e => e.applicationId === app.id);
      const submitted = appEvals.filter(e => !e.isDraft);
      return {
        application: app,
        candidate: candidateMap.get(app.candidateId)!,
        evaluations: appEvals,
        avgScore: calculateAverageScore(submitted),
        hasDisagreement: hasSignificantDisagreement(submitted),
      };
    }).filter(r => r.candidate);

    setRows(appRows);
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Unique positions for filter, sorted strictly by hierarchy
  const positionOptions = Array.from(
    new Map(
      rows.map(r => {
        const label = r.application.club
          ? `${r.application.position} (${r.application.club})`
          : r.application.position;
        return [
          `${r.application.track}::${r.application.position}::${r.application.club || ''}`,
          {
            key: `${r.application.track}::${r.application.position}::${r.application.club || ''}`,
            label,
            position: r.application.position,
            club: r.application.club,
            track: r.application.track,
          },
        ];
      })
    ).values()
  ).sort((a, b) => comparePositions(a, b));

  useEffect(() => {
    let result = rows;
    if (trackFilter) result = result.filter(r => r.application.track === trackFilter);
    if (statusFilter) result = result.filter(r => r.application.status === statusFilter);
    if (positionFilter) {
      result = result.filter(r => {
        const key = `${r.application.track}::${r.application.position}::${r.application.club || ''}`;
        return key === positionFilter || r.application.position === positionFilter;
      });
    }

    if (debouncedQuery.trim()) {
      const fuse = new Fuse(result, {
        keys: ['candidate.fullName', 'candidate.rollNumber', 'application.position', 'application.club'],
        threshold: 0.35,
      });
      result = fuse.search(debouncedQuery).map(r => r.item);
    }

    setFiltered(result);
    setPage(1);
  }, [rows, debouncedQuery, trackFilter, statusFilter, positionFilter]);

  const displayed = filtered.slice(0, page * 50);
  const hasFilters = trackFilter || statusFilter || positionFilter;

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader title="Applications" subtitle={`${rows.length} total · ${filtered.length} shown`} />
      <div className="p-6">
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-48">
            <input className="input" placeholder="Search applications…" value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" onClick={() => setQuery('')}><X size={13} /></button>}
          </div>
          <button className={`btn btn-secondary ${showFilters ? 'bg-stone-100' : ''}`} onClick={() => setShowFilters(f => !f)}>
            <Filter size={13} /> Filters {hasFilters && <span className="ml-1 px-1 bg-navy-700 text-white rounded text-2xs">{[trackFilter, statusFilter, positionFilter].filter(Boolean).length}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="mb-4 p-4 bg-stone-50 border border-stone-200 rounded flex flex-wrap gap-4">
            <div>
              <label className="label">Track</label>
              <select className="input w-44" value={trackFilter} onChange={e => setTrackFilter(e.target.value)}>
                <option value="">All</option>
                {TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Position</label>
              <select className="input w-64" value={positionFilter} onChange={e => setPositionFilter(e.target.value)}>
                <option value="">All</option>
                {positionOptions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            {hasFilters && (
              <div className="flex items-end">
                <button className="btn btn-ghost text-xs" onClick={() => { setTrackFilter(''); setStatusFilter(''); setPositionFilter(''); }}>Clear</button>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Position</th>
                  <th>Track</th>
                  <th>Pref</th>
                  <th>Status</th>
                  <th>Evaluations</th>
                  <th>Avg Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-stone-400">No applications match your filters.</td></tr>
                ) : displayed.map(row => (
                  <tr key={row.application.id}>
                    <td>
                      <Link to={`/candidates/${row.candidate.id}`} className="font-medium text-navy-700 hover:underline">
                        {row.candidate.fullName}
                      </Link>
                      <div className="text-xs text-stone-400">{row.candidate.rollNumber}</div>
                    </td>
                    <td>
                      <div className="text-sm text-stone-800">{row.application.position}</div>
                      {row.application.club && <div className="text-xs text-stone-400">{row.application.club}</div>}
                    </td>
                    <td><TrackBadge track={row.application.track} /></td>
                    <td className="text-sm text-stone-500">#{row.application.preferenceOrder}</td>
                    <td><StatusBadge status={row.application.status} /></td>
                    <td className="text-right font-mono text-sm">
                      {row.evaluations.filter(e => !e.isDraft).length || '—'}
                      {row.hasDisagreement && (
                        <span className="ml-1" title="Significant disagreement">
                          <AlertTriangle size={11} className="inline text-amber-500" />
                        </span>
                      )}
                    </td>
                    <td><ScoreDisplay score={row.avgScore} size="sm" /></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEvalAppId(row.application.id)}>
                        Evaluate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {displayed.length < filtered.length && (
            <div className="px-4 py-3 border-t border-stone-100 text-center">
              <button className="btn btn-ghost text-sm" onClick={() => setPage(p => p + 1)}>
                Load more ({filtered.length - displayed.length} remaining)
              </button>
            </div>
          )}
        </div>
      </div>

      {evalAppId && (
        <EvaluationPanel applicationId={evalAppId} onClose={() => { setEvalAppId(null); load(); }} />
      )}
    </div>
  );
}
