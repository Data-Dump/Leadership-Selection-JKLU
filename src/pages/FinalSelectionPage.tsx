import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { useAuth } from '../auth/AuthContext';
import { logAudit } from '../data/audit';
import { calculateAverageScore, calculateFinalScore, rankApplicationsInPosition } from '../scoring/engine';
import { PageHeader, ScoreDisplay, ConfirmDialog, EmptyState } from '../components/shared/SharedComponents';
import { v4 as uuidv4 } from 'uuid';
import type { Application, Candidate, Evaluation, Interview, FinalDecision, SelectionCycle, FinalDecisionType } from '../types';
import { CheckCircle } from 'lucide-react';

interface FinalRow {
  application: Application;
  candidate: Candidate;
  evaluations: Evaluation[];
  interview?: Interview;
  existingDecision?: FinalDecision;
  appScore?: number;
  interviewScore?: number;
  finalScore?: number;
  isComplete: boolean;
  rank: number;
}

interface PositionGroup {
  position: string;
  track: string;
  rows: FinalRow[];
}

const FINAL_DECISIONS: FinalDecisionType[] = ['Selected', 'Waitlisted', 'Rejected'];

export function FinalSelectionPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<PositionGroup[]>([]);
  const [cycle, setCycle] = useState<SelectionCycle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDecision, setConfirmDecision] = useState<{ appId: string; candidateName: string; decision: FinalDecisionType } | null>(null);
  const [confirmedApps, setConfirmedApps] = useState<Set<string>>(new Set());

  async function load() {
    const [applications, candidates, evaluations, interviews, decisions, activeCycle] = await Promise.all([
      db.applications.where('status').anyOf(['Shortlisted', 'Interview', 'Selected', 'Waitlisted']).toArray(),
      db.candidates.toArray(),
      db.evaluations.filter(e => !e.isDraft).toArray(),
      db.interviews.toArray(),
      db.finalDecisions.toArray(),
      db.selectionCycles.where('active').equals(1).first(),
    ]);

    const candidateMap = new Map(candidates.map(c => [c.id, c]));
    const decisionMap = new Map(decisions.map(d => [d.applicationId, d]));
    const cycleWeights = activeCycle || { applicationWeight: 70, interviewWeight: 30 };
    setCycle(activeCycle || null);

    // Group by position
    const posMap = new Map<string, FinalRow[]>();
    for (const app of applications) {
      const cand = candidateMap.get(app.candidateId);
      if (!cand) continue;

      const appEvals = evaluations.filter(e => e.applicationId === app.id);
      const interview = interviews.find(i => i.applicationId === app.id);
      const decision = decisionMap.get(app.id);

      const appScore = calculateAverageScore(appEvals);
      const interviewScore = interview?.totalScore;
      const { score: finalScore, isComplete } = appScore !== undefined
        ? calculateFinalScore(appScore, interviewScore, cycleWeights)
        : { score: 0, isComplete: false };

      const key = `${app.track}::${app.position}${app.club ? `::${app.club}` : ''}`;
      if (!posMap.has(key)) posMap.set(key, []);
      posMap.get(key)!.push({
        application: app,
        candidate: cand,
        evaluations: appEvals,
        interview,
        existingDecision: decision,
        appScore,
        interviewScore,
        finalScore: appScore !== undefined ? finalScore : undefined,
        isComplete,
        rank: 0,
      });
    }

    // Rank within each position
    const grouped: PositionGroup[] = [];
    for (const [key, rows] of posMap.entries()) {
      const appScores = rows.map(r => ({ applicationId: r.application.id, avgScore: r.finalScore }));
      const ranked = rankApplicationsInPosition(appScores);
      const rankedRows = rows.map(r => {
        const rankEntry = ranked.find(rr => rr.applicationId === r.application.id);
        return { ...r, rank: rankEntry?.rank || 0 };
      }).sort((a, b) => (a.rank || 999) - (b.rank || 999));

      const [, pos] = key.split('::');
      grouped.push({
        position: rows[0].application.position,
        track: rows[0].application.track,
        rows: rankedRows,
      });
    }

    setGroups(grouped.sort((a, b) => a.position.localeCompare(b.position)));
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function makeDecision(appId: string, decision: FinalDecisionType, candidateId: string, candidateName: string) {
    if (!user) return;
    const now = Date.now();
    const existing = await db.finalDecisions.where('applicationId').equals(appId).first();

    const app = await db.applications.get(appId);
    const appScore = app ? calculateAverageScore(
      (await db.evaluations.where('applicationId').equals(appId).filter(e => !e.isDraft).toArray())
    ) : undefined;
    const interview = await db.interviews.where('applicationId').equals(appId).first();
    const cycleData = cycle || { applicationWeight: 70, interviewWeight: 30 };
    const { score: finalScore, isComplete } = appScore !== undefined
      ? calculateFinalScore(appScore, interview?.totalScore, cycleData)
      : { score: 0, isComplete: false };

    if (existing) {
      await db.finalDecisions.update(existing.id, { finalDecision: decision, decidedBy: user.name, decidedAt: now });
    } else {
      const fd: FinalDecision = {
        id: uuidv4(),
        applicationId: appId,
        applicationScore: appScore || 0,
        interviewScore: interview?.totalScore,
        finalScore,
        isComplete,
        finalDecision: decision,
        decidedBy: user.name,
        decidedAt: now,
      };
      await db.finalDecisions.add(fd);
    }

    // Update application status
    await db.applications.update(appId, {
      status: decision === 'Selected' ? 'Selected' : decision === 'Waitlisted' ? 'Waitlisted' : 'Rejected',
      updatedAt: now,
    });

    await logAudit(user.id, user.name, 'final_decision', {
      applicationId: appId,
      candidateId,
      candidateName,
      details: `Final decision: ${decision}`,
    });

    setConfirmedApps(prev => new Set([...prev, appId]));
    setConfirmDecision(null);
    await load();
  }

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  const cycleWeights = cycle || { applicationWeight: 70, interviewWeight: 30 };

  return (
    <div>
      <PageHeader
        title="Final Selection"
        subtitle={`${cycleWeights.applicationWeight}% application · ${cycleWeights.interviewWeight}% interview`}
      />
      <div className="p-6 space-y-6">
        {groups.length === 0 ? (
          <EmptyState
            title="No candidates ready for final selection"
            description="Shortlist and interview candidates before making final decisions."
          />
        ) : groups.map(group => (
          <div key={group.position} className="card">
            <div className="px-5 py-3 border-b border-stone-100">
              <div className="font-semibold text-stone-800">{group.position}</div>
              <div className="text-xs text-stone-400">{group.track}</div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Candidate</th>
                    <th className="text-right">App Score</th>
                    <th className="text-right">Interview Score</th>
                    <th className="text-right">Final Score</th>
                    <th>Decision</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map(row => (
                    <tr key={row.application.id}>
                      <td className="font-mono text-sm text-stone-400">
                        {row.rank > 0 ? `#${row.rank}` : '—'}
                      </td>
                      <td>
                        <Link to={`/candidates/${row.candidate.id}`} className="font-medium text-navy-700 hover:underline">
                          {row.candidate.fullName}
                        </Link>
                        <div className="text-xs text-stone-400">{row.candidate.rollNumber}</div>
                      </td>
                      <td className="text-right"><ScoreDisplay score={row.appScore} size="sm" /></td>
                      <td className="text-right">
                        {row.interviewScore !== undefined ? (
                          <ScoreDisplay score={row.interviewScore} size="sm" />
                        ) : (
                          <span className="text-xs text-stone-400">Pending</span>
                        )}
                      </td>
                      <td className="text-right">
                        {row.finalScore !== undefined ? (
                          <div>
                            <ScoreDisplay score={row.finalScore} size="sm" />
                            {!row.isComplete && <div className="text-2xs text-amber-500">Incomplete</div>}
                          </div>
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      <td>
                        {row.existingDecision ? (
                          <div className="flex items-center gap-1.5">
                            {confirmedApps.has(row.application.id) && <CheckCircle size={12} className="text-green-500" />}
                            <span className={`badge ${
                              row.existingDecision.finalDecision === 'Selected' ? 'badge-selected' :
                              row.existingDecision.finalDecision === 'Waitlisted' ? 'badge-waitlisted' :
                              'badge-rejected'
                            }`}>{row.existingDecision.finalDecision}</span>
                          </div>
                        ) : <span className="text-xs text-stone-400">—</span>}
                      </td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {FINAL_DECISIONS.map(d => (
                            <button
                              key={d}
                              className={`btn btn-sm ${
                                d === 'Selected' ? 'btn-primary' :
                                d === 'Waitlisted' ? 'btn-secondary' :
                                'btn-ghost text-red-600 border-red-200'
                              }`}
                              onClick={() => setConfirmDecision({
                                appId: row.application.id,
                                candidateName: row.candidate.fullName,
                                decision: d,
                              })}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {confirmDecision && (
        <ConfirmDialog
          title={`${confirmDecision.decision}: ${confirmDecision.candidateName}`}
          message={`Are you sure you want to mark ${confirmDecision.candidateName} as ${confirmDecision.decision}? This action will update their application status.`}
          confirmLabel={confirmDecision.decision}
          danger={confirmDecision.decision === 'Rejected'}
          onConfirm={() => {
            const row = groups.flatMap(g => g.rows).find(r => r.application.id === confirmDecision.appId);
            if (row) makeDecision(confirmDecision.appId, confirmDecision.decision, row.candidate.id, row.candidate.fullName);
          }}
          onCancel={() => setConfirmDecision(null)}
        />
      )}
    </div>
  );
}
