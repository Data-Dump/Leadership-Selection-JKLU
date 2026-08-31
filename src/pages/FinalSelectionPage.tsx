import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { useAuth } from '../auth/AuthContext';
import { logAudit } from '../data/audit';
import { calculateAverageScore, rankApplicationsInPosition } from '../scoring/engine';
import { comparePositions } from '../utils/positionHierarchy';
import {
  exportFinalSelectionExcel,
  exportFinalSelectionCSV,
  getFormattedFinalSelectionData,
  generateAnnouncementMarkdown,
  type FinalSelectedRow,
} from '../utils/export';
import { PageHeader, ScoreDisplay, ConfirmDialog, EmptyState } from '../components/shared/SharedComponents';
import { v4 as uuidv4 } from 'uuid';
import type { Application, Candidate, Evaluation, FinalDecision, SelectionCycle, FinalDecisionType } from '../types';
import {
  CheckCircle,
  Download,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  X,
  Award,
  ChevronDown,
  RotateCcw,
  UserMinus,
  Trash2,
} from 'lucide-react';

interface FinalRow {
  application: Application;
  candidate: Candidate;
  evaluations: Evaluation[];
  existingDecision?: FinalDecision;
  appScore?: number;
  finalScore?: number;
  isComplete: boolean;
  rank: number;
}

interface PositionGroup {
  position: string;
  displayName: string;
  club?: string;
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
  const [confirmReset, setConfirmReset] = useState<{
    appId: string;
    candidateId: string;
    candidateName: string;
    action: 'clear_decision' | 'remove_board';
  } | null>(null);
  const [confirmedApps, setConfirmedApps] = useState<Set<string>>(new Set());

  // Export & Announcement state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [copiedNotice, setCopiedNotice] = useState(false);


  async function load() {
    const [applications, candidates, evaluations, decisions, activeCycle] = await Promise.all([
      db.applications.where('status').anyOf(['Shortlisted', 'Selected', 'Waitlisted']).toArray(),
      db.candidates.toArray(),
      db.evaluations.filter(e => !e.isDraft).toArray(),
      db.finalDecisions.toArray(),
      db.selectionCycles.where('active').equals(1).first(),
    ]);

    const candidateMap = new Map(candidates.map(c => [c.id, c]));
    const decisionMap = new Map(decisions.map(d => [d.applicationId, d]));
    setCycle(activeCycle || null);

    // Group by position (and club for club leadership)
    const posMap = new Map<string, FinalRow[]>();
    for (const app of applications) {
      const cand = candidateMap.get(app.candidateId);
      if (!cand) continue;

      const appEvals = evaluations.filter(e => e.applicationId === app.id);
      const decision = decisionMap.get(app.id);

      const appScore = calculateAverageScore(appEvals);
      const finalScore = appScore;

      const key = `${app.track}::${app.position}${app.club ? `::${app.club}` : ''}`;
      if (!posMap.has(key)) posMap.set(key, []);
      posMap.get(key)!.push({
        application: app,
        candidate: cand,
        evaluations: appEvals,
        existingDecision: decision,
        appScore,
        finalScore,
        isComplete: appScore !== undefined,
        rank: 0,
      });
    }

    // Rank within each position
    const grouped: PositionGroup[] = [];
    for (const [, rows] of posMap.entries()) {
      const appScores = rows.map(r => ({ applicationId: r.application.id, avgScore: r.finalScore }));
      const ranked = rankApplicationsInPosition(appScores);
      const rankedRows = rows.map(r => {
        const rankEntry = ranked.find(rr => rr.applicationId === r.application.id);
        return { ...r, rank: rankEntry?.rank || 0 };
      }).sort((a, b) => (a.rank || 999) - (b.rank || 999));

      const firstApp = rows[0].application;
      const displayName = firstApp.club ? `${firstApp.position} (${firstApp.club})` : firstApp.position;

      grouped.push({
        position: firstApp.position,
        displayName,
        club: firstApp.club,
        track: firstApp.track,
        rows: rankedRows,
      });
    }

    // Sort groups strictly according to position hierarchy:
    setGroups(grouped.sort((a, b) => comparePositions(
      { name: a.position, club: a.club, track: a.track },
      { name: b.position, club: b.club, track: b.track }
    )));
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  const totalSelected = useMemo(() => {
    let count = 0;
    groups.forEach(g => {
      g.rows.forEach(r => {
        if (r.existingDecision?.finalDecision === 'Selected' || r.application.status === 'Selected') {
          count++;
        }
      });
    });
    return count;
  }, [groups]);

  async function makeDecision(appId: string, decision: FinalDecisionType, candidateId: string, candidateName: string) {
    if (!user) return;
    const now = Date.now();
    const existing = await db.finalDecisions.where('applicationId').equals(appId).first();

    const app = await db.applications.get(appId);
    const appScore = app ? calculateAverageScore(
      (await db.evaluations.where('applicationId').equals(appId).filter(e => !e.isDraft).toArray())
    ) : undefined;
    const finalScore = appScore || 0;

    if (existing) {
      await db.finalDecisions.update(existing.id, { finalDecision: decision, decidedBy: user.name, decidedAt: now });
    } else {
      const fd: FinalDecision = {
        id: uuidv4(),
        applicationId: appId,
        applicationScore: appScore || 0,
        finalScore,
        isComplete: true,
        finalDecision: decision,
        decidedBy: user.name,
        decidedAt: now,
      };
      await db.finalDecisions.add(fd);
    }

    // Update application status
    await db.applications.update(appId, {
      status: decision,
      updatedAt: now,
    });

    await logAudit(user.id, user.name, 'final_decision', {
      candidateId,
      candidateName,
      applicationId: appId,
      details: `Final decision: ${decision}`,
    });

    setConfirmedApps(prev => new Set(prev).add(appId));
    setConfirmDecision(null);
    await load();
  }

  async function removeDecision(appId: string, candidateId: string, candidateName: string, revertToPending = false) {
    if (!user) return;
    const now = Date.now();

    // 1. Delete final decision record
    const existing = await db.finalDecisions.where('applicationId').equals(appId).first();
    if (existing) {
      await db.finalDecisions.delete(existing.id);
    }

    // 2. Update application status
    const targetStatus = revertToPending ? 'Pending Review' : 'Shortlisted';
    await db.applications.update(appId, {
      status: targetStatus,
      updatedAt: now,
    });


    // 3. Log audit
    await logAudit(user.id, user.name, 'final_decision', {
      candidateId,
      candidateName,
      applicationId: appId,
      details: revertToPending
        ? 'Removed from final selection board and reverted to Pending Review'
        : 'Cleared final decision back to Shortlisted',
    });

    setConfirmedApps(prev => {
      const next = new Set(prev);
      next.delete(appId);
      return next;
    });
    setConfirmReset(null);
    await load();
  }

  async function handleDownloadExcel(selectedOnly = true) {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      await exportFinalSelectionExcel(selectedOnly);
    } finally {
      setIsExporting(false);
    }
  }


  async function handleDownloadCSV(selectedOnly = true) {
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      await exportFinalSelectionCSV(selectedOnly);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleOpenNoticeModal() {
    setShowExportMenu(false);
    const data = await getFormattedFinalSelectionData(true);
    const md = generateAnnouncementMarkdown(data);
    setAnnouncementText(md);
    setShowNoticeModal(true);
  }

  async function handleCopyNotice() {
    await navigator.clipboard.writeText(announcementText);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2000);
  }

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader
        title="Final Selection"
        subtitle={`${totalSelected} selected leaders · Final decisions based on rubric evaluations`}
        actions={
          <div className="flex items-center gap-2 relative">
            <button
              type="button"
              onClick={handleOpenNoticeModal}
              className="btn btn-secondary btn-sm gap-1.5"
              title="View and copy official announcement list"
            >
              <FileText size={13} />
              <span>Official Notice</span>
            </button>

            {/* Extract dropdown button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowExportMenu(prev => !prev)}
                className="btn btn-primary btn-sm gap-1.5 font-medium"
                disabled={isExporting}
              >
                <Download size={13} />
                <span>{isExporting ? 'Exporting…' : 'Extract Final List'}</span>
                <ChevronDown size={13} />
              </button>

              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 mt-1.5 w-64 bg-white border border-stone-200 rounded-xl shadow-xl z-50 p-1.5 text-xs">
                    <div className="px-3 py-1.5 text-2xs font-semibold text-stone-400 uppercase tracking-wider">
                      Formatted Excel (.xlsx)
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadExcel(true)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-50 flex items-center gap-2 text-stone-700 hover:text-navy-900 transition-colors"
                    >
                      <FileSpreadsheet size={14} className="text-emerald-600" />
                      <div>
                        <div className="font-medium">Selected Leaders Only (.xlsx)</div>
                        <div className="text-2xs text-stone-400">Official council in hierarchy order</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadExcel(false)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-50 flex items-center gap-2 text-stone-700 hover:text-navy-900 transition-colors"
                    >
                      <FileSpreadsheet size={14} className="text-blue-600" />
                      <div>
                        <div className="font-medium">All Final Decisions (.xlsx)</div>
                        <div className="text-2xs text-stone-400">Selected, Waitlisted & Rejected</div>
                      </div>
                    </button>

                    <div className="border-t border-stone-100 my-1" />

                    <div className="px-3 py-1.5 text-2xs font-semibold text-stone-400 uppercase tracking-wider">
                      CSV Format (.csv)
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadCSV(true)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-50 flex items-center gap-2 text-stone-700 hover:text-navy-900 transition-colors"
                    >
                      <Download size={14} className="text-stone-500" />
                      <span>Download Selected CSV</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {groups.length === 0 ? (
          <EmptyState
            title="No candidates ready for final selection"
            description="Shortlist candidates from the Applications or Candidate Profile pages before making final decisions."
          />
        ) : groups.map(group => (
          <div key={`${group.track}::${group.position}::${group.club || ''}`} className="card">
            <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
              <div>
                <div className="font-semibold text-stone-800 text-base">{group.displayName}</div>
                <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                  <span className="badge bg-stone-100 text-stone-700">{group.track}</span>
                  {group.club && (
                    <span className="badge bg-navy-50 text-navy-700 border border-navy-200">
                      Club: {group.club}
                    </span>
                  )}
                  <span>• {group.rows.length} candidate{group.rows.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Candidate</th>
                    <th className="text-right">Evaluation Score</th>
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {FINAL_DECISIONS.map(dec => (
                            <button
                              key={dec}
                              className={`btn btn-sm ${
                                row.existingDecision?.finalDecision === dec
                                  ? dec === 'Selected'
                                    ? 'btn-primary bg-emerald-600 border-emerald-600 text-white'
                                    : 'btn-secondary'
                                  : 'btn-secondary'
                              }`}
                              onClick={() => setConfirmDecision({
                                appId: row.application.id,
                                candidateName: row.candidate.fullName,
                                decision: dec,
                              })}
                            >
                              {dec}
                            </button>
                          ))}

                          {/* Clear decision if already set */}
                          {row.existingDecision && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-stone-500 hover:text-amber-700 hover:bg-amber-50 gap-1 text-xs px-2"
                              title="Clear final decision back to Shortlisted"
                              onClick={() => setConfirmReset({
                                appId: row.application.id,
                                candidateId: row.candidate.id,
                                candidateName: row.candidate.fullName,
                                action: 'clear_decision',
                              })}
                            >
                              <RotateCcw size={12} />
                              <span>Clear</span>
                            </button>
                          )}

                          {/* Remove candidate from Final Selection board completely */}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-stone-400 hover:text-red-600 hover:bg-red-50 gap-1 text-xs px-2"
                            title="Remove candidate from final selection board and revert to Pending Review"
                            onClick={() => setConfirmReset({
                              appId: row.application.id,
                              candidateId: row.candidate.id,
                              candidateName: row.candidate.fullName,
                              action: 'remove_board',
                            })}
                          >
                            <UserMinus size={13} />
                            <span>Remove</span>
                          </button>
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

      {/* Confirmation Dialog for Setting Decision */}
      {confirmDecision && (
        <ConfirmDialog
          title={`Confirm Decision: ${confirmDecision.decision}`}
          message={`Set final decision for ${confirmDecision.candidateName} as "${confirmDecision.decision}"?`}
          confirmLabel={confirmDecision.decision}
          danger={confirmDecision.decision === 'Rejected'}
          onConfirm={() => {
            const group = groups.find(g => g.rows.some(r => r.application.id === confirmDecision.appId));
            const row = group?.rows.find(r => r.application.id === confirmDecision.appId);
            if (row) makeDecision(confirmDecision.appId, confirmDecision.decision, row.candidate.id, row.candidate.fullName);
          }}
          onCancel={() => setConfirmDecision(null)}
        />
      )}

      {/* Confirmation Dialog for Clear / Remove from Board */}
      {confirmReset && (
        <ConfirmDialog
          title={
            confirmReset.action === 'clear_decision'
              ? 'Clear Final Decision'
              : 'Remove from Final Selection Board'
          }
          message={
            confirmReset.action === 'clear_decision'
              ? `Reset final decision for ${confirmReset.candidateName} back to "Shortlisted"?`
              : `Remove ${confirmReset.candidateName} from the Final Selection board and revert application status back to "Pending Review"?`
          }
          confirmLabel={
            confirmReset.action === 'clear_decision' ? 'Clear Decision' : 'Remove Candidate'
          }
          danger={confirmReset.action === 'remove_board'}
          onConfirm={() =>
            removeDecision(
              confirmReset.appId,
              confirmReset.candidateId,
              confirmReset.candidateName,
              confirmReset.action === 'remove_board'
            )
          }
          onCancel={() => setConfirmReset(null)}
        />
      )}


      {/* Official Notice / Announcement Modal */}
      {showNoticeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-navy-100 text-navy-800 rounded-lg">
                  <Award size={16} />
                </div>
                <div>
                  <h2 className="font-semibold text-stone-800 text-sm">Official Selected Leadership Notice</h2>
                  <p className="text-2xs text-stone-500">Formatted announcement text for circulars, emails & notice board</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNoticeModal(false)}
                className="btn btn-ghost btn-sm p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 font-mono text-xs text-stone-800 whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto selection:bg-navy-200">
                {announcementText}
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-stone-200 bg-stone-50 flex items-center justify-between shrink-0">
              <div className="text-xs text-stone-500">
                {totalSelected} leaders formatted in hierarchy order
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyNotice}
                  className="btn btn-secondary btn-sm gap-1.5"
                >
                  {copiedNotice ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                  <span>{copiedNotice ? 'Copied to Clipboard' : 'Copy Notice Text'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadExcel(true)}
                  className="btn btn-primary btn-sm gap-1.5"
                >
                  <FileSpreadsheet size={13} />
                  <span>Download Excel</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
