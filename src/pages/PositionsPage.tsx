import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../data/db';
import { PageHeader, StatusBadge, ScoreDisplay, EmptyState } from '../components/shared/SharedComponents';
import { calculateAverageScore, rankApplicationsInPosition } from '../scoring/engine';
import type { Application, Candidate, Evaluation, Position } from '../types';

interface PositionStats {
  position: Position;
  applicationsCount: number;
  evaluatedCount: number;
  shortlistedCount: number;
  interviewedCount: number;
  selectedCount: number;
  rankedApplications: Array<{
    rank: number;
    application: Application;
    candidate: Candidate;
    avgScore?: number;
    status: string;
  }>;
}

export function PositionsPage() {
  const [positions, setPositions] = useState<PositionStats[]>([]);
  const [selectedPos, setSelectedPos] = useState<PositionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const queryFilter = searchParams.get('q') || '';

  useEffect(() => {
    async function load() {
      const [positionList, applications, candidates, evaluations, interviews] = await Promise.all([
        db.positions.toArray(),
        db.applications.toArray(),
        db.candidates.toArray(),
        db.evaluations.filter(e => !e.isDraft).toArray(),
        db.interviews.toArray(),
      ]);

      const candidateMap = new Map(candidates.map(c => [c.id, c]));

      const stats: PositionStats[] = positionList.map(pos => {
        const posApps = applications.filter(a => a.positionNormalized === pos.nameNormalized);
        const appIds = new Set(posApps.map(a => a.id));
        const evalledApps = new Set(evaluations.filter(e => appIds.has(e.applicationId)).map(e => e.applicationId));
        const interviewedApps = new Set(interviews.filter(i => appIds.has(i.applicationId)).map(i => i.applicationId));

        // Compute avg scores for ranking
        const appScores = posApps.map(app => {
          const appEvals = evaluations.filter(e => e.applicationId === app.id);
          return {
            applicationId: app.id,
            avgScore: calculateAverageScore(appEvals),
          };
        });

        const ranked = rankApplicationsInPosition(appScores);

        const rankedApplications = ranked.map(r => ({
          rank: r.rank,
          application: posApps.find(a => a.id === r.applicationId)!,
          candidate: candidateMap.get(posApps.find(a => a.id === r.applicationId)?.candidateId || '')!,
          avgScore: r.avgScore,
          status: posApps.find(a => a.id === r.applicationId)?.status || '',
        })).filter(r => r.application && r.candidate);

        return {
          position: pos,
          applicationsCount: posApps.length,
          evaluatedCount: evalledApps.size,
          shortlistedCount: posApps.filter(a => ['Shortlisted', 'Interview', 'Selected'].includes(a.status)).length,
          interviewedCount: interviewedApps.size,
          selectedCount: posApps.filter(a => a.status === 'Selected').length,
          rankedApplications,
        };
      }).sort((a, b) => b.applicationsCount - a.applicationsCount);

      setPositions(stats);

      // Auto-select if query filter matches
      if (queryFilter) {
        const match = stats.find(p =>
          p.position.name.toLowerCase().includes(queryFilter.toLowerCase())
        );
        if (match) setSelectedPos(match);
      }

      setIsLoading(false);
    }
    load();
  }, [queryFilter]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="flex h-full">
      {/* Position list */}
      <div className="w-64 shrink-0 border-r border-stone-200 bg-white overflow-y-auto">
        <div className="px-4 py-3 border-b border-stone-100">
          <div className="section-header mb-0">Positions ({positions.length})</div>
        </div>
        {positions.map(ps => (
          <button
            key={ps.position.id}
            className={`w-full text-left px-4 py-3 border-b border-stone-50 hover:bg-stone-50 transition-colors ${
              selectedPos?.position.id === ps.position.id ? 'bg-navy-50 border-l-2 border-l-navy-700' : ''
            }`}
            onClick={() => setSelectedPos(ps)}
          >
            <div className="text-sm font-medium text-stone-800 truncate">{ps.position.name}</div>
            <div className="text-xs text-stone-400 mt-0.5">
              {ps.position.track} {ps.position.club ? `· ${ps.position.club}` : ''}
            </div>
            <div className="flex gap-3 mt-1 text-2xs text-stone-400">
              <span>{ps.applicationsCount} applied</span>
              <span>{ps.evaluatedCount} evaluated</span>
              <span>{ps.shortlistedCount} shortlisted</span>
            </div>
          </button>
        ))}
      </div>

      {/* Position detail */}
      <div className="flex-1 overflow-y-auto">
        {!selectedPos ? (
          <EmptyState
            title="Select a position"
            description="Choose a position from the list to see its candidates and rankings."
          />
        ) : (
          <div>
            <div className="bg-white border-b border-stone-200 px-6 py-5">
              <h1 className="page-title">{selectedPos.position.name}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-stone-500">
                <span>{selectedPos.position.track}</span>
                {selectedPos.position.club && <span>· {selectedPos.position.club}</span>}
              </div>
              <div className="flex gap-6 mt-3 text-sm">
                {[
                  { label: 'Applications', value: selectedPos.applicationsCount },
                  { label: 'Evaluated', value: selectedPos.evaluatedCount },
                  { label: 'Shortlisted', value: selectedPos.shortlistedCount },
                  { label: 'Interviewed', value: selectedPos.interviewedCount },
                  { label: 'Selected', value: selectedPos.selectedCount },
                ].map(s => (
                  <div key={s.label}>
                    <div className="text-xs text-stone-400">{s.label}</div>
                    <div className="font-semibold text-stone-700 font-mono">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6">
              <div className="card">
                <div className="px-5 py-3 border-b border-stone-100">
                  <div className="section-header mb-0">Candidates — Ranked by Average Score</div>
                  <div className="text-xs text-stone-400 mt-1">
                    Only ranks candidates with at least one submitted evaluation. Unranked candidates shown at bottom.
                  </div>
                </div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Candidate</th>
                        <th>Roll No.</th>
                        <th>Status</th>
                        <th>Evaluations</th>
                        <th className="text-right">Avg Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPos.rankedApplications.length === 0 ? (
                        <tr><td colSpan={6} className="py-8 text-center text-stone-400">No candidates for this position.</td></tr>
                      ) : selectedPos.rankedApplications.map(row => (
                        <tr key={row.application.id}>
                          <td className="font-mono text-sm text-stone-400">
                            {row.rank > 0 ? `#${row.rank}` : '—'}
                          </td>
                          <td>
                            <Link to={`/candidates/${row.candidate.id}`} className="font-medium text-navy-700 hover:underline">
                              {row.candidate.fullName}
                            </Link>
                          </td>
                          <td className="font-mono text-xs text-stone-400">{row.candidate.rollNumber}</td>
                          <td><StatusBadge status={row.status as never} /></td>
                          <td className="text-right font-mono text-sm text-stone-500">—</td>
                          <td className="text-right">
                            {row.avgScore !== undefined ? (
                              <ScoreDisplay score={row.avgScore} size="sm" />
                            ) : (
                              <span className="text-xs text-stone-400">Not evaluated</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
