import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../data/db';
import { PageHeader, StatusBadge, ScoreDisplay, EmptyState } from '../components/shared/SharedComponents';
import { calculateAverageScore, rankApplicationsInPosition } from '../scoring/engine';
import { comparePositions } from '../utils/positionHierarchy';
import type { Application, Candidate, Evaluation, Position } from '../types';

interface PositionStats {
  position: Position;
  displayName: string;
  applicationsCount: number;
  evaluatedCount: number;
  shortlistedCount: number;
  interviewedCount: number;
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
          shortlistedCount: posApps.filter(a => ['Shortlisted', 'Interview', 'Selected'].includes(a.status)).length,
          interviewedCount: interviewedApps.size,
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
      } else if (stats.length > 0 && !selectedPos) {
        setSelectedPos(stats[0]);
      }

      setIsLoading(false);
    }
    load();
  }, [queryFilter]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="flex h-full">
      {/* Position list */}
      <div className="w-72 shrink-0 border-r border-stone-200 bg-white overflow-y-auto">
        <div className="px-4 py-3 border-b border-stone-100 bg-stone-50/50">
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
            <div className="text-sm font-medium text-stone-800 leading-snug">{ps.displayName}</div>
            <div className="text-xs text-stone-400 mt-0.5">
              {ps.position.track}
            </div>
            <div className="flex gap-3 mt-1 text-2xs text-stone-400">
              <span className="font-mono">{ps.applicationsCount} applied</span>
              <span>•</span>
              <span className="font-mono">{ps.evaluatedCount} evaluated</span>
              <span>•</span>
              <span className="font-mono">{ps.shortlistedCount} shortlisted</span>
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
              <div className="flex items-center gap-2 mb-1">
                <span className="badge bg-stone-100 text-stone-700 text-xs">{selectedPos.position.track}</span>
                {selectedPos.position.club && (
                  <span className="badge bg-navy-50 text-navy-700 border border-navy-200 text-xs">Club: {selectedPos.position.club}</span>
                )}
              </div>
              <h1 className="page-title">{selectedPos.displayName}</h1>
              <div className="flex gap-6 mt-4 text-sm">
                {[
                  { label: 'Total Applications', value: selectedPos.applicationsCount },
                  { label: 'Evaluated', value: selectedPos.evaluatedCount },
                  { label: 'Shortlisted', value: selectedPos.shortlistedCount },
                  { label: 'Interviewed', value: selectedPos.interviewedCount },
                  { label: 'Selected', value: selectedPos.selectedCount },
                ].map(s => (
                  <div key={s.label}>
                    <div className="text-xs text-stone-400">{s.label}</div>
                    <div className="font-semibold text-stone-800 font-mono text-base">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6">
              <div className="card">
                <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <div className="section-header mb-0">Applied Candidates ({selectedPos.rankedApplications.length})</div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      Ranked by average evaluation score. Candidates with no evaluations are listed at the bottom.
                    </div>
                  </div>
                </div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Candidate</th>
                        <th>Roll No.</th>
                        <th>Programme / Batch</th>
                        <th>Status</th>
                        <th className="text-center">Evaluations</th>
                        <th className="text-right">Avg Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPos.rankedApplications.length === 0 ? (
                        <tr><td colSpan={7} className="py-8 text-center text-stone-400">No candidates applied for this specific position.</td></tr>
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
                          <td className="font-mono text-xs text-stone-500">{row.candidate.rollNumber}</td>
                          <td className="text-xs text-stone-500">
                            {row.candidate.programme || '—'} {row.candidate.batch ? `(${row.candidate.batch})` : ''}
                          </td>
                          <td><StatusBadge status={row.status as never} /></td>
                          <td className="text-center font-mono text-xs text-stone-600">
                            {row.evaluationsCount > 0 ? (
                              <span className="badge bg-blue-50 text-blue-700 border border-blue-200">{row.evaluationsCount}</span>
                            ) : (
                              <span className="text-stone-300">0</span>
                            )}
                          </td>
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
