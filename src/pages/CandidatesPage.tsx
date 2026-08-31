import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { useDebounce } from '../hooks/useDebounce';
import {
  StatusBadge, ScoreDisplay, TrackBadge, EmptyState, PageHeader
} from '../components/shared/SharedComponents';
import Fuse from 'fuse.js';
import { ChevronUp, ChevronDown, Filter, X } from 'lucide-react';
import type { Candidate, Application, ApplicationStatus, Track } from '../types';

interface CandidateRow {
  candidate: Candidate;
  primaryApp?: Application;
  allApps: Application[];
  evaluationCount: number;
  avgScore?: number;
  finalDecision?: string;
}

type SortField = 'name' | 'score' | 'evaluations' | 'added';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

const TRACKS: Track[] = ['Student Council', 'Club Leadership', 'Coordinator'];
const STATUSES: ApplicationStatus[] = [
  'Pending Review', 'Under Review', 'Shortlisted', 'Selected', 'Waitlisted', 'Hold', 'Rejected'
];


export function CandidatesPage() {
  const [allRows, setAllRows] = useState<CandidateRow[]>([]);
  const [filtered, setFiltered] = useState<CandidateRow[]>([]);
  const [displayed, setDisplayed] = useState<CandidateRow[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [query, setQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [batchFilter, setBatchFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const debouncedQuery = useDebounce(query, 250);

  // Load data
  useEffect(() => {
    async function load() {
      const [candidates, applications, evaluations] = await Promise.all([
        db.candidates.toArray(),
        db.applications.toArray(),
        db.evaluations.where('isDraft').equals(0).toArray(),
      ]);

      const evalMap = new Map<string, number[]>();
      for (const ev of evaluations) {
        const arr = evalMap.get(ev.applicationId) || [];
        arr.push(ev.totalScore);
        evalMap.set(ev.applicationId, arr);
      }

      const rows: CandidateRow[] = candidates.map(c => {
        const apps = applications.filter(a => a.candidateId === c.id);
        const primaryApp = apps.find(a => a.preferenceOrder === 1) || apps[0];

        // Average score across all of this candidate's applications
        const allScores: number[] = [];
        for (const app of apps) {
          const scores = evalMap.get(app.id) || [];
          allScores.push(...scores);
        }
        const avgScore = allScores.length > 0
          ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
          : undefined;

        return {
          candidate: c,
          primaryApp,
          allApps: apps,
          evaluationCount: allScores.length,
          avgScore,
        };
      });

      setAllRows(rows);
      setIsLoading(false);
    }
    load();
  }, []);

  // Filter + search + sort
  useEffect(() => {
    let result = allRows;

    // Track filter
    if (trackFilter) {
      result = result.filter(r =>
        r.allApps.some(a => a.track === trackFilter)
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter(r =>
        r.allApps.some(a => a.status === statusFilter)
      );
    }

    // Batch filter
    if (batchFilter) {
      result = result.filter(r => r.candidate.batch === batchFilter);
    }

    // Fuzzy search
    if (debouncedQuery.trim()) {
      const fuse = new Fuse(result, {
        keys: ['candidate.fullName', 'candidate.rollNumber', 'candidate.email', 'primaryApp.position', 'primaryApp.club'],
        threshold: 0.35,
      });
      result = fuse.search(debouncedQuery).map(r => r.item);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.candidate.fullName.localeCompare(b.candidate.fullName);
      else if (sortField === 'score') {
        if (a.avgScore === undefined) return 1;
        if (b.avgScore === undefined) return -1;
        cmp = a.avgScore - b.avgScore;
      }
      else if (sortField === 'evaluations') cmp = a.evaluationCount - b.evaluationCount;
      else if (sortField === 'added') cmp = a.candidate.createdAt - b.candidate.createdAt;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    setFiltered(result);
    setPage(1);
  }, [allRows, debouncedQuery, trackFilter, statusFilter, batchFilter, sortField, sortDir]);

  // Paginate
  useEffect(() => {
    setDisplayed(filtered.slice(0, page * PAGE_SIZE));
  }, [filtered, page]);

  const batches = [...new Set(allRows.map(r => r.candidate.batch).filter(Boolean))].sort() as string[];

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} className="ml-0.5" /> : <ChevronDown size={12} className="ml-0.5" />;
  }

  const hasFilters = trackFilter || statusFilter || batchFilter;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading candidates…</div>;
  }

  return (
    <div>
      <PageHeader
        title="Candidates"
        subtitle={`${allRows.length} candidates · ${filtered.length} shown`}
      />

      <div className="p-6">
        {/* Search + filter bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-48">
            <input
              type="text"
              className="input pr-8"
              placeholder="Search by name, roll number, position…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search candidates"
            />
            {query && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" onClick={() => setQuery('')}>
                <X size={13} />
              </button>
            )}
          </div>
          <button
            className={`btn btn-secondary ${showFilters ? 'bg-stone-100' : ''}`}
            onClick={() => setShowFilters(f => !f)}
          >
            <Filter size={13} />
            Filters
            {hasFilters && <span className="ml-1 px-1 py-0.5 bg-navy-700 text-white rounded text-2xs">
              {[trackFilter, statusFilter, batchFilter].filter(Boolean).length}
            </span>}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mb-4 p-4 bg-stone-50 border border-stone-200 rounded flex flex-wrap gap-4">
            <div>
              <label className="label">Track</label>
              <select className="input w-44" value={trackFilter} onChange={e => setTrackFilter(e.target.value)}>
                <option value="">All tracks</option>
                {TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Application Status</label>
              <select className="input w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Batch</label>
              <select className="input w-32" value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
                <option value="">All batches</option>
                {batches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {hasFilters && (
              <div className="flex items-end">
                <button className="btn btn-ghost text-xs" onClick={() => { setTrackFilter(''); setStatusFilter(''); setBatchFilter(''); }}>
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <button className="flex items-center" onClick={() => toggleSort('name')}>
                      Candidate <SortIcon field="name" />
                    </button>
                  </th>
                  <th>Roll No.</th>
                  <th>Primary Position</th>
                  <th>Track</th>
                  <th>Status</th>
                  <th>
                    <button className="flex items-center" onClick={() => toggleSort('evaluations')}>
                      Evaluations <SortIcon field="evaluations" />
                    </button>
                  </th>
                  <th>
                    <button className="flex items-center" onClick={() => toggleSort('score')}>
                      Avg Score <SortIcon field="score" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-stone-400">
                      {query || hasFilters ? 'No candidates match your search.' : 'No candidates found.'}
                    </td>
                  </tr>
                ) : (
                  displayed.map(row => (
                    <tr key={row.candidate.id}>
                      <td>
                        <Link
                          to={`/candidates/${row.candidate.id}`}
                          className="font-medium text-navy-700 hover:underline"
                        >
                          {row.candidate.fullName}
                        </Link>
                        <div className="text-xs text-stone-400 mt-0.5">
                          {row.candidate.programme} {row.candidate.batch}
                        </div>
                      </td>
                      <td className="font-mono text-xs text-stone-500">{row.candidate.rollNumber}</td>
                      <td>
                        <div className="text-sm text-stone-700">{row.primaryApp?.position || '—'}</div>
                        {row.primaryApp?.club && (
                          <div className="text-xs text-stone-400">{row.primaryApp.club}</div>
                        )}
                      </td>
                      <td>
                        {row.primaryApp ? <TrackBadge track={row.primaryApp.track} /> : '—'}
                      </td>
                      <td>
                        {row.primaryApp ? (
                          <StatusBadge status={row.primaryApp.status} />
                        ) : '—'}
                      </td>
                      <td className="text-right font-mono text-sm">
                        {row.evaluationCount > 0 ? row.evaluationCount : '—'}
                      </td>
                      <td>
                        <ScoreDisplay score={row.avgScore} size="sm" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {displayed.length < filtered.length && (
            <div className="px-4 py-3 border-t border-stone-100 text-center">
              <button className="btn btn-ghost text-sm" onClick={() => setPage(p => p + 1)}>
                Load more ({filtered.length - displayed.length} remaining)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
