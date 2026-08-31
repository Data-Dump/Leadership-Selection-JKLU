import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../data/db';
import { StatusBadge, ScoreDisplay, EmptyState } from '../components/shared/SharedComponents';
import { calculateAverageScore, rankApplicationsInPosition } from '../scoring/engine';
import { comparePositions } from '../utils/positionHierarchy';
import type { Application, Candidate, Evaluation, Position, Track } from '../types';
import { Search, Users, ClipboardCheck, Star, Award, ChevronRight } from 'lucide-react';

interface PositionStats {
  position: Position;
  displayName: string;
  applicationsCount: number;
  evaluatedCount: number;
  shortlistedCount: number;
  selectedCount: number;
  rankedApplications: Array<{
    rank: number;
    application: Application;
    candidate: Candidate;
    evaluationsCount: number;
    avgScore?: number;
    status: string;
  }>;
}

const TRACK_TABS: Array<{ key: 'all' | Track; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Student Council', label: 'Student Council' },
  { key: 'Club Leadership', label: 'Club Leadership' },
  { key: 'Coordinator', label: 'Coordinator' },
];

export function PositionsPage() {
  const [positions, setPositions] = useState<PositionStats[]>([]);
  const [selectedPos, setSelectedPos] = useState<PositionStats | null>(null);
  const [activeTrack, setActiveTrack] = useState<'all' | Track>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const queryFilter = searchParams.get('q') || '';

  useEffect(() => {
    async function load() {
      const [positionList, applications, candidates, evaluations] = await Promise.all([
        db.positions.toArray(),
        db.applications.toArray(),
        db.candidates.toArray(),
        db.evaluations.filter(e => !e.isDraft).toArray(),
      ]);

      const candidateMap = new Map(candidates.map(c => [c.id, c]));

      const stats: PositionStats[] = positionList.map(pos => {
        // Strict matching: Track + Position + Club (for club positions)
        const posApps = applications.filter(a => {
          if (a.track !== pos.track) return false;
          if (pos.club || a.club) {
            return (
              a.positionNormalized === pos.nameNormalized &&
              (a.club || '').trim().toLowerCase() === (pos.club || '').trim().toLowerCase()
            );
          }
          return a.positionNormalized === pos.nameNormalized;
        });

        const appIds = new Set(posApps.map(a => a.id));
        const evalledApps = new Set(evaluations.filter(e => appIds.has(e.applicationId)).map(e => e.applicationId));

        // Compute avg scores for ranking
        const appScores = posApps.map(app => {
          const appEvals = evaluations.filter(e => e.applicationId === app.id);
          return {
            applicationId: app.id,
            avgScore: calculateAverageScore(appEvals),
          };
        });

        const ranked = rankApplicationsInPosition(appScores);

        const rankedApplications = ranked.map(r => {
          const app = posApps.find(a => a.id === r.applicationId)!;
          const cand = candidateMap.get(app?.candidateId || '')!;
          const appEvals = evaluations.filter(e => e.applicationId === r.applicationId);
          return {
            rank: r.rank,
            application: app,
            candidate: cand,
            evaluationsCount: appEvals.length,
            avgScore: r.avgScore,
            status: app?.status || '',
          };
        }).filter(r => r.application && r.candidate);

        const displayName = pos.club ? `${pos.name} (${pos.club})` : pos.name;

        return {
          position: pos,
          displayName,
          applicationsCount: posApps.length,
          evaluatedCount: evalledApps.size,
          shortlistedCount: posApps.filter(a => a.status === 'Shortlisted').length,
          selectedCount: posApps.filter(a => a.status === 'Selected').length,
          rankedApplications,
        };
      }).sort((a, b) => comparePositions(
        { name: a.position.name, club: a.position.club, track: a.position.track },
        { name: b.position.name, club: b.position.club, track: b.position.track }
      ));

      setPositions(stats);

      // Auto-select if query filter matches or first item
      if (queryFilter) {
        const match = stats.find(p =>
          p.displayName.toLowerCase().includes(queryFilter.toLowerCase())
        );
        if (match) setSelectedPos(match);
      } else if (stats.length > 0) {
        setSelectedPos(prev => prev ? (stats.find(s => s.position.id === prev.position.id) || stats[0]) : stats[0]);
      }

      setIsLoading(false);
    }
    load();
  }, [queryFilter]);

  const filteredPositions = useMemo(() => {
    return positions.filter(p => {
      const matchesTrack = activeTrack === 'all' || p.position.track === activeTrack;
      const matchesSearch = !searchQuery ||
        p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.position.club && p.position.club.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesTrack && matchesSearch;
    });
  }, [positions, activeTrack, searchQuery]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="flex h-full bg-white">
      {/* Position list sidebar */}
      <div className="w-72 shrink-0 border-r border-stone-200 bg-white flex flex-col h-full">
        <div className="p-3.5 border-b border-stone-100 bg-white space-y-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-800 text-sm">Positions</h2>
            <span className="text-2xs font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-medium">
              {filteredPositions.length} / {positions.length}
            </span>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" size={13} />
            <input
              type="text"
              placeholder="Search positions or clubs…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-navy-600"
            />
          </div>

          {/* Track Filter Pills (flex-wrap to prevent horizontal scrollbar) */}
          <div className="flex flex-wrap gap-1">
            {TRACK_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTrack(tab.key)}
                className={`px-2 py-1 text-2xs rounded-md font-medium transition-colors ${
                  activeTrack === tab.key
                    ? 'bg-navy-700 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>


        {/* Position Cards List */}
        <div className="overflow-y-auto flex-1 divide-y divide-stone-100">
          {filteredPositions.length === 0 ? (
            <div className="p-6 text-center text-stone-400 text-xs">
              No positions match the filter.
            </div>
          ) : (
            filteredPositions.map(ps => {
              const isSelected = selectedPos?.position.id === ps.position.id;
              return (
                <button
                  key={ps.position.id}
                  type="button"
                  onClick={() => setSelectedPos(ps)}
                  className={`w-full text-left px-4 py-3 border-b border-stone-100 transition-colors ${
                    isSelected
                      ? 'bg-navy-50 border-l-2 border-l-navy-700'
                      : 'hover:bg-stone-50'
                  }`}
                >

                  <div className="text-sm font-medium text-stone-800 leading-snug">{ps.displayName}</div>
                  <div className="text-xs text-stone-400 mt-0.5">
                    {ps.position.track}
                  </div>
                  <div className="flex items-center gap-2.5 mt-1.5 text-2xs text-stone-500">
                    <span><span className="font-mono font-semibold text-stone-800">{ps.applicationsCount}</span> applied</span>
                    <span className="text-stone-300">•</span>
                    <span><span className="font-mono font-semibold text-stone-800">{ps.evaluatedCount}</span> evaluated</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>


      {/* Position detail view */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {!selectedPos ? (
          <EmptyState
            title="Select a position"
            description="Choose a position from the left sidebar to view applied candidates and rank standings."
          />
        ) : (
          <div className="space-y-6">
            {/* Header with KPI Cards */}
            <div className="bg-white border-b border-stone-200 px-8 py-6">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="badge bg-stone-100 text-stone-700 text-xs font-medium">
                  {selectedPos.position.track}
                </span>
                {selectedPos.position.club && (
                  <span className="badge bg-navy-50 text-navy-700 border border-navy-200 text-xs font-medium">
                    Club: {selectedPos.position.club}
                  </span>
                )}
              </div>

              <h1 className="text-xl font-bold text-stone-900 tracking-tight">
                {selectedPos.displayName}
              </h1>

              {/* Aligned KPI Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-5">
                <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-stone-200/70 text-stone-700 flex items-center justify-center shrink-0">
                    <Users size={18} />
                  </div>
                  <div>
                    <div className="text-xs text-stone-500 font-medium">Applied</div>
                    <div className="font-mono font-bold text-lg text-stone-900 leading-tight">
                      {selectedPos.applicationsCount}
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <ClipboardCheck size={18} />
                  </div>
                  <div>
                    <div className="text-xs text-blue-700 font-medium">Evaluated</div>
                    <div className="font-mono font-bold text-lg text-blue-900 leading-tight">
                      {selectedPos.evaluatedCount}
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Star size={18} />
                  </div>
                  <div>
                    <div className="text-xs text-amber-700 font-medium">Shortlisted</div>
                    <div className="font-mono font-bold text-lg text-amber-900 leading-tight">
                      {selectedPos.shortlistedCount}
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Award size={18} />
                  </div>
                  <div>
                    <div className="text-xs text-emerald-700 font-medium">Selected</div>
                    <div className="font-mono font-bold text-lg text-emerald-900 leading-tight">
                      {selectedPos.selectedCount}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate Table */}
            <div className="px-8 pb-8">
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between bg-white">
                  <div>
                    <h3 className="font-semibold text-stone-800 text-sm">
                      Applied Candidates ({selectedPos.rankedApplications.length})
                    </h3>
                    <p className="text-2xs text-stone-400 mt-0.5">
                      Ranked strictly by average rubric evaluation score
                    </p>
                  </div>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-600 text-xs font-semibold">
                      <th className="py-3 px-4 w-16 text-center">Rank</th>
                      <th className="py-3 px-4">Candidate</th>
                      <th className="py-3 px-4">Roll Number</th>
                      <th className="py-3 px-4">Programme & Batch</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Evaluations</th>
                      <th className="py-3 px-4 text-right">Avg Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-xs">
                    {selectedPos.rankedApplications.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-stone-400">
                          No candidates applied for this position.
                        </td>
                      </tr>
                    ) : (
                      selectedPos.rankedApplications.map(row => (
                        <tr key={row.application.id} className="hover:bg-stone-50/80 transition-colors">
                          <td className="py-3 px-4 text-center font-mono text-sm font-semibold text-stone-400">
                            {row.rank > 0 ? (
                              <span className={row.rank <= 3 ? 'text-navy-700 font-bold' : ''}>
                                #{row.rank}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <Link
                              to={`/candidates/${row.candidate.id}`}
                              className="font-medium text-navy-700 hover:text-navy-900 hover:underline text-sm"
                            >
                              {row.candidate.fullName}
                            </Link>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-stone-500">
                            {row.candidate.rollNumber}
                          </td>
                          <td className="py-3 px-4 text-xs text-stone-600">
                            {row.candidate.programme || '—'} {row.candidate.batch ? `(${row.candidate.batch})` : ''}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={row.status as never} />
                          </td>
                          <td className="py-3 px-4 text-center">
                            {row.evaluationsCount > 0 ? (
                              <span className="inline-flex items-center justify-center px-2 py-0.5 font-mono text-xs font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200">
                                {row.evaluationsCount}
                              </span>
                            ) : (
                              <span className="text-stone-300 font-mono">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {row.avgScore !== undefined ? (
                              <ScoreDisplay score={row.avgScore} size="sm" />
                            ) : (
                              <span className="text-xs text-stone-400 font-mono">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
