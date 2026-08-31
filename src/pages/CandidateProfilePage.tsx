import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../data/db';
import { setApplicationStatus, logAudit } from '../data/audit';
import { useAuth } from '../auth/AuthContext';
import {
  StatusBadge, TrackBadge, ScoreDisplay, ConfirmDialog, PageHeader
} from '../components/shared/SharedComponents';
import { calculateAverageScore, hasSignificantDisagreement, DISAGREEMENT_THRESHOLD } from '../scoring/engine';
import type { Candidate, Application, Evaluation, FinalDecision } from '../types';
import {
  ChevronLeft, Star, PauseCircle, XCircle, CheckCircle,
  Copy, Check, AlertTriangle, ChevronDown, ChevronUp, User, FileText
} from 'lucide-react';
import { EvaluationPanel } from '../components/evaluation/EvaluationPanel';

interface ApplicationData {
  application: Application;
  evaluations: Evaluation[];
  finalDecision?: FinalDecision;
  avgScore?: number;
  hasDisagreement: boolean;
}

export function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [appData, setAppData] = useState<ApplicationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [showEvalPanel, setShowEvalPanel] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; appId: string; label: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [c, apps, evals, decisions] = await Promise.all([
      db.candidates.get(id),
      db.applications.where('candidateId').equals(id).toArray(),
      db.evaluations.toArray(),
      db.finalDecisions.toArray(),
    ]);

    if (!c) { navigate('/candidates'); return; }
    setCandidate(c);

    const data: ApplicationData[] = apps.map(app => {
      const appEvals = evals.filter(e => e.applicationId === app.id);
      const appDecision = decisions.find(d => d.applicationId === app.id);
      const submittedEvals = appEvals.filter(e => !e.isDraft);

      return {
        application: app,
        evaluations: appEvals,
        finalDecision: appDecision,
        avgScore: calculateAverageScore(submittedEvals),
        hasDisagreement: hasSignificantDisagreement(submittedEvals),
      };
    }).sort((a, b) => a.application.preferenceOrder - b.application.preferenceOrder);

    setAppData(data);
    setIsLoading(false);

    // Expand the first application by default
    if (data.length > 0 && !expandedApp) {
      setExpandedApp(data[0].application.id);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusAction(action: string, appId: string) {
    if (!user) return;
    const statusMap: Record<string, string> = {
      shortlist: 'Shortlisted',
      hold: 'Hold',
      reject: 'Rejected',
      select: 'Selected',
      waitlist: 'Waitlisted',
    };
    await setApplicationStatus(appId, statusMap[action], user.id, user.name);
    await load();
    setConfirmAction(null);
  }

  async function copyText(text: string, fieldId: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;
  }
  if (!candidate) return null;

  const primaryApp = appData[0];

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-5">
        <button
          onClick={() => navigate('/candidates')}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 mb-3"
        >
          <ChevronLeft size={13} /> Back to Candidates
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{candidate.fullName}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-stone-500">
              <span className="font-mono text-xs">{candidate.rollNumber}</span>
              {candidate.programme && <span>{candidate.programme}</span>}
              {candidate.batch && <span>Batch {candidate.batch}</span>}
              {candidate.email && <span className="text-xs">{candidate.email}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {primaryApp && <StatusBadge status={primaryApp.application.status} />}
              {primaryApp && <TrackBadge track={primaryApp.application.track} />}
            </div>
          </div>
          {primaryApp && (
            <div className="text-right">
              {primaryApp.avgScore !== undefined && (
                <ScoreDisplay score={primaryApp.avgScore} size="lg" />
              )}
              {primaryApp.evaluations.filter(e => !e.isDraft).length > 0 && (
                <div className="text-xs text-stone-400 mt-1">
                  {primaryApp.evaluations.filter(e => !e.isDraft).length} evaluator{primaryApp.evaluations.filter(e => !e.isDraft).length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-6 max-w-4xl space-y-4">
        {/* Candidate Info */}
        <div className="card p-5">
          <div className="section-header">Candidate Information</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              { label: 'Full Name', value: candidate.fullName },
              { label: 'Roll Number', value: candidate.rollNumber },
              { label: 'Email', value: candidate.email },
              { label: 'Phone', value: candidate.phone || '—' },
              { label: 'Programme', value: candidate.programme || '—' },
              { label: 'Batch', value: candidate.batch || '—' },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-stone-400 mb-0.5">{f.label}</div>
                <div className="text-stone-800">{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Applications */}
        {appData.map((ad, idx) => (
          <div key={ad.application.id} className="card overflow-hidden">
            {/* App header */}
            <button
              className="w-full flex items-center justify-between p-5 hover:bg-stone-50 transition-colors"
              onClick={() => setExpandedApp(expandedApp === ad.application.id ? null : ad.application.id)}
              aria-expanded={expandedApp === ad.application.id}
            >
              <div className="flex items-center gap-3 text-left">
                <div className="text-xs font-semibold text-stone-400 w-6">
                  {idx === 0 ? '1st' : idx === 1 ? '2nd' : `${idx + 1}th`}
                </div>
                <div>
                  <div className="font-medium text-stone-800">{ad.application.position}</div>
                  <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-2">
                    <TrackBadge track={ad.application.track} className="text-2xs" />
                    {ad.application.club && <span>· {ad.application.club}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={ad.application.status} />
                {ad.avgScore !== undefined && (
                  <ScoreDisplay score={ad.avgScore} size="sm" />
                )}
                {ad.hasDisagreement && (
                  <span title={`Evaluators differ by ≥${DISAGREEMENT_THRESHOLD} points`}>
                    <AlertTriangle size={14} className="text-amber-500" />
                  </span>
                )}
                {expandedApp === ad.application.id ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
              </div>
            </button>

            {expandedApp === ad.application.id && (
              <div className="border-t border-stone-100">
                {/* Action buttons */}
                <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex flex-wrap gap-2">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setConfirmAction({ action: 'shortlist', appId: ad.application.id, label: 'Shortlist this application?' })}
                  >
                    <Star size={12} /> Shortlist
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setConfirmAction({ action: 'hold', appId: ad.application.id, label: 'Put application on Hold?' })}
                  >
                    <PauseCircle size={12} /> Hold
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'transparent', color: '#B91C1C', borderColor: '#FCA5A5' }}
                    onClick={() => setConfirmAction({ action: 'reject', appId: ad.application.id, label: 'Reject this application? This cannot be undone.' })}
                  >
                    <XCircle size={12} /> Reject
                  </button>
                  {user?.role !== 'Viewer' && (
                    <button
                      className="btn btn-sm btn-primary ml-auto"
                      onClick={() => setShowEvalPanel(ad.application.id)}
                    >
                      <FileText size={12} /> Evaluate
                    </button>
                  )}
                </div>


                {/* Application content */}
                <div className="p-5 space-y-5">
                  {/* Area of interest */}
                  {ad.application.areaOfInterest && (
                    <div>
                      <div className="label">Area of Interest</div>
                      <div className="text-sm text-stone-700">{ad.application.areaOfInterest}</div>
                    </div>
                  )}

                  {/* Past Experience */}
                  {ad.application.pastExperience ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="label mb-0">Past Experience</div>
                        <button
                          className="btn btn-ghost btn-sm text-stone-400"
                          onClick={() => copyText(ad.application.pastExperience!, `exp-${ad.application.id}`)}
                          title="Copy to clipboard"
                        >
                          {copiedField === `exp-${ad.application.id}` ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded p-3">
                        {ad.application.pastExperience}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="label">Past Experience</div>
                      <div className="text-sm text-stone-400 italic">Not provided</div>
                    </div>
                  )}

                  {/* Why Should We Choose You */}
                  {ad.application.whyChooseYou ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="label mb-0">Why Should We Choose You?</div>
                        <button
                          className="btn btn-ghost btn-sm text-stone-400"
                          onClick={() => copyText(ad.application.whyChooseYou!, `why-${ad.application.id}`)}
                          title="Copy to clipboard"
                        >
                          {copiedField === `why-${ad.application.id}` ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded p-3">
                        {ad.application.whyChooseYou}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="label">Why Should We Choose You?</div>
                      <div className="text-sm text-stone-400 italic">Not provided</div>
                    </div>
                  )}

                  {/* Next preference */}
                  {ad.application.nextPreference && ad.application.nextPreference.toLowerCase() !== 'none' && (
                    <div>
                      <div className="label">Next Preference</div>
                      <div className="text-sm text-stone-600">{ad.application.nextPreference}</div>
                    </div>
                  )}

                  {/* Evaluations */}
                  <div>
                    <div className="label">Evaluations ({ad.evaluations.filter(e => !e.isDraft).length} submitted{ad.evaluations.filter(e => e.isDraft).length > 0 ? `, ${ad.evaluations.filter(e => e.isDraft).length} draft` : ''})</div>
                    {ad.evaluations.length === 0 ? (
                      <div className="text-sm text-stone-400">No evaluations yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {/* Disagreement warning */}
                        {ad.hasDisagreement && (
                          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                            <AlertTriangle size={12} />
                            <span>⚠ Significant evaluator disagreement — scores differ by ≥{DISAGREEMENT_THRESHOLD} points.</span>
                          </div>
                        )}

                        {/* Score summary */}
                        {ad.evaluations.filter(e => !e.isDraft).length >= 2 && (
                          <div className="grid grid-cols-4 gap-2 text-xs text-center py-2 bg-stone-50 border border-stone-100 rounded">
                            {[
                              { label: 'Average', value: ad.avgScore?.toFixed(1) },
                              { label: 'Highest', value: Math.max(...ad.evaluations.filter(e => !e.isDraft).map(e => e.totalScore)).toFixed(1) },
                              { label: 'Lowest', value: Math.min(...ad.evaluations.filter(e => !e.isDraft).map(e => e.totalScore)).toFixed(1) },
                              { label: 'Count', value: ad.evaluations.filter(e => !e.isDraft).length },
                            ].map(s => (
                              <div key={s.label}>
                                <div className="text-stone-400">{s.label}</div>
                                <div className="font-medium text-stone-700 font-mono">{s.value}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Individual evaluations */}
                        {ad.evaluations.map(ev => (
                          <EvaluationSummaryRow key={ev.id} evaluation={ev} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.action === 'reject' ? 'Reject Application' : 'Confirm Action'}
          message={confirmAction.label}
          confirmLabel={confirmAction.action === 'reject' ? 'Reject' : 'Confirm'}
          danger={confirmAction.action === 'reject'}
          onConfirm={() => handleStatusAction(confirmAction.action, confirmAction.appId)}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Evaluation panel */}
      {showEvalPanel && (
        <EvaluationPanel
          applicationId={showEvalPanel}
          onClose={() => { setShowEvalPanel(null); load(); }}
        />
      )}
    </div>
  );
}

function EvaluationSummaryRow({ evaluation }: { evaluation: Evaluation }) {
  const [evaluatorName, setEvaluatorName] = useState('');
  useEffect(() => {
    db.evaluators.get(evaluation.evaluatorId).then(ev => {
      if (ev) setEvaluatorName(ev.name);
    });
  }, [evaluation.evaluatorId]);

  return (
    <div className="flex items-center justify-between p-2 border border-stone-100 rounded text-sm bg-white">
      <div className="flex items-center gap-2">
        <User size={12} className="text-stone-400" />
        <span className="text-stone-700">{evaluatorName}</span>
        {evaluation.isDraft && <span className="badge badge-pending text-2xs">Draft</span>}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-stone-400">{evaluation.recommendation}</span>
        <ScoreDisplay score={evaluation.totalScore} size="sm" />
      </div>
    </div>
  );
}
