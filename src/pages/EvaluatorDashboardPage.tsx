import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { useAuth } from '../auth/AuthContext';
import { calculateAverageScore } from '../scoring/engine';
import { comparePositions } from '../utils/positionHierarchy';
import { EvaluationPanel } from '../components/evaluation/EvaluationPanel';

import { PageHeader, StatusBadge, ScoreDisplay, TrackBadge, EmptyState } from '../components/shared/SharedComponents';
import type { Application, Candidate, Evaluation, Track, Rubric, ApplicationStatus } from '../types';
import {
  Search,
  Filter,
  X,
  ChevronUp,
  ChevronDown,
  HelpCircle,
  Play,
  FileEdit,
  Award,
  Layers,
  Clock,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import Fuse from 'fuse.js';

interface CandidateEvalRow {
  candidate: Candidate;
  primaryApp?: Application;
  allApps: Application[];
  myEvaluation?: Evaluation;
  submittedEvals: Evaluation[];
  avgScore?: number;
}

type SortField = 'name' | 'roll' | 'position' | 'myScore' | 'avgScore' | 'status';
type SortDir = 'asc' | 'desc';

const TRACKS: Track[] = ['Student Council', 'Club Leadership', 'Coordinator'];
const STATUSES: ApplicationStatus[] = [
  'Pending Review', 'Under Review', 'Shortlisted', 'Selected', 'Waitlisted', 'Hold', 'Rejected'
];


export function EvaluatorDashboardPage() {
  const { user } = useAuth();
  const [allRows, setAllRows] = useState<CandidateEvalRow[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active status filter tab
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted' | 'drafts' | 'all'>('pending');

  // Search and advanced filters
  const [query, setQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('');
  const [positionFilter, setPositionFilter] = useState<string>('');
  const [batchFilter, setBatchFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Sorting: default to Position Hierarchy
  const [sortField, setSortField] = useState<SortField>('position');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Evaluation panel & modal
  const [evalAppId, setEvalAppId] = useState<string | null>(null);
  const [showRubricModal, setShowRubricModal] = useState(false);

  async function loadData() {
    if (!user) return;
    try {
      const [candidates, applications, evaluations, rubricsList] = await Promise.all([
        db.candidates.toArray(),
        db.applications.toArray(),
        db.evaluations.toArray(),
        db.rubrics.toArray(),
      ]);

      const rows: CandidateEvalRow[] = candidates.map(c => {
        const apps = applications.filter(a => a.candidateId === c.id);
        const primaryApp = apps.find(a => a.preferenceOrder === 1) || apps[0];

        // Gather all evaluations for this candidate's applications
        const candidateAppIds = new Set(apps.map(a => a.id));
        const appEvals = evaluations.filter(e => candidateAppIds.has(e.applicationId));
        const submitted = appEvals.filter(e => !e.isDraft);
        
        // Find current evaluator's evaluation (on primary app or any app)
        const myEval = appEvals.find(e => e.evaluatorId === user.id);

        return {
          candidate: c,
          primaryApp,
          allApps: apps,
          myEvaluation: myEval,
          submittedEvals: submitted,
          avgScore: calculateAverageScore(submitted),
        };
      }).sort((a, b) => {
        const posCmp = comparePositions(
          { name: a.primaryApp?.position, club: a.primaryApp?.club, track: a.primaryApp?.track },
          { name: b.primaryApp?.position, club: b.primaryApp?.club, track: b.primaryApp?.track }
        );
        if (posCmp !== 0) return posCmp;
        return a.candidate.fullName.localeCompare(b.candidate.fullName);
      });

      setAllRows(rows);
      setRubrics(rubricsList);
    } catch (err) {
      console.error('Failed to load evaluation queue:', err);
    } finally {
      setIsLoading(false);
    }
  }


  useEffect(() => {
    loadData();
  }, [user]);

  // Derived counts (163 candidates total)
  const pendingCount = allRows.filter(r => !r.myEvaluation || r.myEvaluation.isDraft).length;
  const submittedCount = allRows.filter(r => r.myEvaluation && !r.myEvaluation.isDraft).length;
  const draftCount = allRows.filter(r => r.myEvaluation && r.myEvaluation.isDraft).length;
  const totalCandidates = allRows.length;

  const completedRows = allRows.filter(r => r.myEvaluation && !r.myEvaluation.isDraft);
  const myAvgScore = completedRows.length > 0
    ? Math.round(completedRows.reduce((sum, r) => sum + (r.myEvaluation?.totalScore || 0), 0) / completedRows.length)
    : undefined;

  // Batches and positions list for dropdowns
  const batches = useMemo(() => {
    return [...new Set(allRows.map(r => r.candidate.batch).filter(Boolean))].sort() as string[];
  }, [allRows]);

  const uniquePositions = useMemo(() => {
    const set = new Set<string>();
    allRows.forEach(r => {
      r.allApps.forEach(app => {
        if (!trackFilter || app.track === trackFilter) {
          set.add(app.position);
        }
      });
    });
    return Array.from(set).sort();
  }, [allRows, trackFilter]);

  // Filter and sort
  const filteredRows = useMemo(() => {
    let result = allRows;

    // Tab filter
    if (activeTab === 'pending') {
      result = result.filter(r => !r.myEvaluation || r.myEvaluation.isDraft);
    } else if (activeTab === 'submitted') {
      result = result.filter(r => r.myEvaluation && !r.myEvaluation.isDraft);
    } else if (activeTab === 'drafts') {
      result = result.filter(r => r.myEvaluation && r.myEvaluation.isDraft);
    }

    // Track filter
    if (trackFilter) {
      result = result.filter(r => r.allApps.some(a => a.track === trackFilter));
    }

    // Position filter
    if (positionFilter) {
      result = result.filter(r => r.allApps.some(a => a.position === positionFilter));
    }

    // Batch filter
    if (batchFilter) {
      result = result.filter(r => r.candidate.batch === batchFilter);
    }

    // Search query with Fuse
    if (query.trim()) {
      const fuse = new Fuse(result, {
        keys: [
          'candidate.fullName',
          'candidate.rollNumber',
          'candidate.email',
          'primaryApp.position',
          'primaryApp.club',
          'allApps.position',
          'allApps.club'
        ],
        threshold: 0.35,
      });
      result = fuse.search(query.trim()).map(r => r.item);
    }

    // Sorting
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.candidate.fullName.localeCompare(b.candidate.fullName);
      } else if (sortField === 'roll') {
        cmp = a.candidate.rollNumber.localeCompare(b.candidate.rollNumber);
      } else if (sortField === 'position') {
        cmp = comparePositions(
          { name: a.primaryApp?.position, club: a.primaryApp?.club, track: a.primaryApp?.track },
          { name: b.primaryApp?.position, club: b.primaryApp?.club, track: b.primaryApp?.track }
        );
      } else if (sortField === 'myScore') {

        const scoreA = a.myEvaluation?.totalScore ?? -1;
        const scoreB = b.myEvaluation?.totalScore ?? -1;
        cmp = scoreA - scoreB;
      } else if (sortField === 'avgScore') {
        const avgA = a.avgScore ?? -1;
        const avgB = b.avgScore ?? -1;
        cmp = avgA - avgB;
      } else if (sortField === 'status') {
        const statA = a.primaryApp?.status || '';
        const statB = b.primaryApp?.status || '';
        cmp = statA.localeCompare(statB);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allRows, activeTab, trackFilter, positionFilter, batchFilter, query, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} className="ml-0.5" /> : <ChevronDown size={12} className="ml-0.5" />;
  }

  // Quick action: start next evaluation
  function handleStartNext() {
    const firstDraft = allRows.find(r => r.myEvaluation && r.myEvaluation.isDraft && r.primaryApp);
    if (firstDraft?.primaryApp) {
      setEvalAppId(firstDraft.myEvaluation?.applicationId || firstDraft.primaryApp.id);
      return;
    }
    const firstPending = allRows.find(r => !r.myEvaluation && r.primaryApp);
    if (firstPending?.primaryApp) {
      setEvalAppId(firstPending.primaryApp.id);
      return;
    }
    if (filteredRows.length > 0 && filteredRows[0].primaryApp) {
      setEvalAppId(filteredRows[0].primaryApp.id);
    }
  }

  // Next / Previous navigation inside EvaluationPanel
  const activeIdx = filteredRows.findIndex(r => r.primaryApp?.id === evalAppId || r.myEvaluation?.applicationId === evalAppId);
  const hasNext = activeIdx >= 0 && activeIdx < filteredRows.length - 1;
  const hasPrev = activeIdx > 0;

  function goToNext() {
    if (hasNext && filteredRows[activeIdx + 1].primaryApp) {
      const nextRow = filteredRows[activeIdx + 1];
      setEvalAppId(nextRow.myEvaluation?.applicationId || nextRow.primaryApp!.id);
    }
  }

  function goToPrev() {
    if (hasPrev && filteredRows[activeIdx - 1].primaryApp) {
      const prevRow = filteredRows[activeIdx - 1];
      setEvalAppId(prevRow.myEvaluation?.applicationId || prevRow.primaryApp!.id);
    }
  }

  function handleClosePanel() {
    setEvalAppId(null);
    loadData();
  }

  const hasFilters = trackFilter || positionFilter || batchFilter;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-stone-400 text-sm">
        Loading evaluation queue…
      </div>
    );
  }

  const defaultRubric = rubrics[0];

  return (
    <div>
      <PageHeader
        title="Evaluation Queue"
        subtitle={`${pendingCount} pending review · ${submittedCount} submitted by you · ${totalCandidates} total candidates`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRubricModal(true)}
              className="btn btn-secondary btn-sm gap-1.5"
            >
              <HelpCircle size={13} />
              <span>Rubric Guide</span>
            </button>
            <button
              type="button"
              onClick={handleStartNext}
              className="btn btn-primary btn-sm gap-1.5 font-medium"
            >
              {draftCount > 0 ? (
                <>
                  <FileEdit size={13} />
                  <span>Resume Draft ({draftCount})</span>
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" />
                  <span>Start Evaluating</span>
                </>
              )}
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-orange-600">{pendingCount}</div>
              <div className="text-2xs text-stone-500">Pending Your Review</div>
            </div>
          </div>

          <div className="card p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 size={16} />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-emerald-700">{submittedCount}</div>
              <div className="text-2xs text-stone-500">Submitted by You</div>
            </div>
          </div>

          <div className="card p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Layers size={16} />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-stone-800">{totalCandidates}</div>
              <div className="text-2xs text-stone-500">Total Candidates</div>
            </div>
          </div>

          <div className="card p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
              <TrendingUp size={16} />
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-purple-700">
                {myAvgScore !== undefined ? `${myAvgScore}/100` : '—'}
              </div>
              <div className="text-2xs text-stone-500">Your Average Score</div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 border-b border-stone-200">
          {[
            { key: 'pending', label: `Pending (${pendingCount})` },
            { key: 'submitted', label: `Submitted (${submittedCount})` },
            { key: 'drafts', label: `Drafts (${draftCount})` },
            { key: 'all', label: `All (${totalCandidates})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-navy-700 text-navy-700 font-medium'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + Filter controls bar */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              className="input pl-8 pr-8"
              placeholder="Search by candidate name, roll number, position…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search candidates"
            />
            {query && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                onClick={() => setQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            className={`btn btn-secondary ${showFilters ? 'bg-stone-100' : ''}`}
            onClick={() => setShowFilters(f => !f)}
          >
            <Filter size={13} />
            <span>Filters</span>
            {hasFilters && (
              <span className="ml-1 px-1.5 py-0.5 bg-navy-700 text-white rounded text-2xs font-mono">
                {[trackFilter, positionFilter, batchFilter].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Filter Drawer / Panel */}
        {showFilters && (
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg flex flex-wrap gap-4 items-end">
            <div>
              <label className="label text-xs">Track</label>
              <select
                className="input text-xs w-44 bg-white"
                value={trackFilter}
                onChange={e => {
                  setTrackFilter(e.target.value);
                  setPositionFilter('');
                }}
              >
                <option value="">All tracks</option>
                {TRACKS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label text-xs">Position</label>
              <select
                className="input text-xs w-52 bg-white truncate"
                value={positionFilter}
                onChange={e => setPositionFilter(e.target.value)}
              >
                <option value="">All positions ({uniquePositions.length})</option>
                {uniquePositions.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label text-xs">Batch</label>
              <select
                className="input text-xs w-32 bg-white"
                value={batchFilter}
                onChange={e => setBatchFilter(e.target.value)}
              >
                <option value="">All batches</option>
                {batches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {hasFilters && (
              <div>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => {
                    setTrackFilter('');
                    setPositionFilter('');
                    setBatchFilter('');
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Candidates Data Table */}
        {filteredRows.length === 0 ? (
          <EmptyState
            title={activeTab === 'pending' ? 'All caught up' : 'No candidates found'}
            description={
              activeTab === 'pending'
                ? 'You have submitted evaluations for all candidates in this queue.'
                : 'Try adjusting your search query or filter options above.'
            }
            action={
              hasFilters || query ? (
                <button
                  onClick={() => {
                    setQuery('');
                    setTrackFilter('');
                    setPositionFilter('');
                    setBatchFilter('');
                    setActiveTab('all');
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Reset all filters
                </button>
              ) : undefined
            }
          />
        ) : (
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
                    <th>
                      <button className="flex items-center" onClick={() => toggleSort('position')}>
                        Applied Position <SortIcon field="position" />
                      </button>
                    </th>
                    <th>Track</th>
                    <th>
                      <button className="flex items-center" onClick={() => toggleSort('status')}>
                        Status <SortIcon field="status" />
                      </button>
                    </th>
                    <th>My Status</th>
                    <th>
                      <button className="flex items-center" onClick={() => toggleSort('myScore')}>
                        My Score <SortIcon field="myScore" />
                      </button>
                    </th>
                    <th>
                      <button className="flex items-center" onClick={() => toggleSort('avgScore')}>
                        Avg Score <SortIcon field="avgScore" />
                      </button>
                    </th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => {
                    const hasDraft = row.myEvaluation && row.myEvaluation.isDraft;
                    const isSubmitted = row.myEvaluation && !row.myEvaluation.isDraft;
                    const otherAppsCount = row.allApps.length - 1;

                    return (
                      <tr key={row.candidate.id} className="hover:bg-stone-50/80 transition-colors">
                        {/* Candidate Column */}
                        <td>
                          <Link
                            to={`/candidates/${row.candidate.id}`}
                            className="font-medium text-navy-700 hover:underline"
                          >
                            {row.candidate.fullName}
                          </Link>
                          <div className="text-2xs text-stone-400 font-mono mt-0.5">
                            {row.candidate.rollNumber} {row.candidate.programme && `· ${row.candidate.programme}`} {row.candidate.batch && `(${row.candidate.batch})`}
                          </div>
                        </td>

                        {/* Position Column */}
                        <td>
                          <div className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
                            <span>{row.primaryApp?.position || '—'}</span>
                            {otherAppsCount > 0 && (
                              <span className="px-1.5 py-0.2 bg-stone-100 text-stone-600 rounded text-2xs font-mono" title={`Applied for ${row.allApps.length} positions in total`}>
                                +{otherAppsCount} more
                              </span>
                            )}
                          </div>
                          {row.primaryApp?.club && (
                            <div className="text-2xs text-purple-700 font-medium">{row.primaryApp.club}</div>
                          )}
                        </td>

                        {/* Track */}
                        <td>
                          {row.primaryApp ? <TrackBadge track={row.primaryApp.track} /> : '—'}
                        </td>

                        {/* Status */}
                        <td>
                          {row.primaryApp ? <StatusBadge status={row.primaryApp.status} /> : '—'}
                        </td>

                        {/* Evaluator Status */}
                        <td>
                          {isSubmitted ? (
                            <span className="badge badge-selected text-2xs">Submitted</span>
                          ) : hasDraft ? (
                            <span className="badge badge-hold text-2xs">Draft</span>
                          ) : (
                            <span className="text-xs text-stone-400">Not started</span>
                          )}
                        </td>

                        {/* My Score */}
                        <td>
                          {isSubmitted ? (
                            <ScoreDisplay score={row.myEvaluation?.totalScore} size="sm" />
                          ) : hasDraft ? (
                            <span className="text-xs font-mono text-amber-700 font-medium">
                              {row.myEvaluation?.totalScore || 0} (draft)
                            </span>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>

                        {/* Avg Score */}
                        <td>
                          <ScoreDisplay score={row.avgScore} size="sm" />
                        </td>

                        {/* Action Button */}
                        <td className="text-right">
                          <button
                            type="button"
                            className={`btn btn-sm ${
                              isSubmitted
                                ? 'btn-secondary text-navy-700'
                                : hasDraft
                                ? 'btn-primary bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
                                : 'btn-primary'
                            }`}
                            onClick={() => {
                              if (row.primaryApp) {
                                setEvalAppId(row.myEvaluation?.applicationId || row.primaryApp.id);
                              }
                            }}
                          >
                            {isSubmitted ? 'Edit / View' : hasDraft ? 'Continue' : 'Evaluate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Rubric Guide Modal */}
      {showRubricModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-navy-100 text-navy-800 rounded-lg">
                  <Award size={16} />
                </div>
                <div>
                  <h2 className="font-semibold text-stone-800 text-sm">Official Evaluation Rubric Guide</h2>
                  <p className="text-2xs text-stone-500">Criteria & standard score weighting</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRubricModal(false)}
                className="btn btn-ghost btn-sm p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <p className="text-stone-600 leading-relaxed">
                When scoring, evaluate each criterion on a scale of <strong className="font-semibold text-stone-800">0 to 10</strong>. The system automatically computes the weighted 100-point total score.
              </p>

              <div className="space-y-3">
                {defaultRubric?.criteria?.map(crit => (
                  <div key={crit.id} className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/50">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="font-semibold text-stone-800">{crit.name}</div>
                      <span className="px-2 py-0.5 rounded-full bg-navy-100 text-navy-800 font-mono text-2xs font-bold">
                        Weight: {crit.weight}%
                      </span>
                    </div>
                    <p className="text-stone-500 text-2xs leading-relaxed">{crit.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-stone-200 bg-stone-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowRubricModal(false)}
                className="btn btn-primary btn-sm"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation Panel */}
      {evalAppId && (
        <EvaluationPanel
          applicationId={evalAppId}
          onClose={handleClosePanel}
          onNextCandidate={hasNext ? goToNext : undefined}
          onPrevCandidate={hasPrev ? goToPrev : undefined}
          candidateIndex={activeIdx >= 0 ? activeIdx + 1 : undefined}
          totalCandidatesInQueue={filteredRows.length}
        />
      )}
    </div>
  );
}
