import { useEffect, useState, useCallback } from 'react';
import { db } from '../../data/db';
import { useAuth } from '../../auth/AuthContext';
import { calculateWeightedScore } from '../../scoring/engine';
import { logAudit } from '../../data/audit';
import { v4 as uuidv4 } from 'uuid';
import type { Application, Candidate, RubricCriterion, Evaluation, EvaluationScore, RecommendationType } from '../../types';
import { X, Save, Info, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { ScoreDisplay } from '../shared/SharedComponents';

const DRAFT_KEY = (appId: string, evalId: string) => `jklu_eval_draft_${appId}_${evalId}`;

const RECOMMENDATIONS: RecommendationType[] = [
  'Strongly Recommend', 'Recommend', 'Hold', 'Do Not Recommend'
];

interface Props {
  applicationId: string;
  onClose: () => void;
  onNextCandidate?: () => void;
  onPrevCandidate?: () => void;
  candidateIndex?: number;
  totalCandidatesInQueue?: number;
}

export function EvaluationPanel({
  applicationId,
  onClose,
  onNextCandidate,
  onPrevCandidate,
  candidateIndex,
  totalCandidatesInQueue,
}: Props) {

  const { user } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [allCandidateApps, setAllCandidateApps] = useState<Application[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>(applicationId);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [rubricId, setRubricId] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [recommendation, setRecommendation] = useState<RecommendationType>('Recommend');
  const [existingEval, setExistingEval] = useState<Evaluation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [cycle, setCycle] = useState<{ blindEvaluation: boolean }>({ blindEvaluation: false });

  const evalDraftId = existingEval?.id || `new-${applicationId}-${user?.id}`;

  useEffect(() => {
    async function load() {
      if (!user) return;
      const app = await db.applications.get(applicationId);
      if (!app) return;
      setApplication(app);
      setSelectedAppId(app.id);

      const cand = await db.candidates.get(app.candidateId);
      setCandidate(cand || null);

      // Load all applications submitted by this candidate
      const candidateApps = await db.applications.where('candidateId').equals(app.candidateId).toArray();
      setAllCandidateApps(candidateApps.sort((a, b) => (a.preferenceOrder || 1) - (b.preferenceOrder || 1)));

      // Get rubric for this position or default
      const allPositions = await db.positions.toArray();
      const pos = allPositions.find(p =>
        p.nameNormalized === app.positionNormalized &&
        p.track === app.track &&
        (!p.club || (app.club && p.club.toLowerCase() === app.club.toLowerCase()))
      );
      let rubric = pos?.rubricId
        ? await db.rubrics.get(pos.rubricId)
        : await db.rubrics.get('rubric-default-1');
      if (!rubric) rubric = await db.rubrics.get('rubric-default-1');
      if (!rubric) return;

      setCriteria(rubric.criteria);
      setRubricId(rubric.id);

      // Check for existing evaluation by this evaluator
      const myEval = await db.evaluations
        .where('applicationId').equals(applicationId)
        .filter(e => e.evaluatorId === user.id)
        .first();

      // Check cycle settings
      const activeCycle = await db.selectionCycles.where('active').equals(1).first();
      if (activeCycle) setCycle({ blindEvaluation: activeCycle.blindEvaluation });

      if (myEval) {
        setExistingEval(myEval);
        const scoreMap: Record<string, number> = {};
        myEval.scores.forEach(s => { scoreMap[s.criterionId] = s.score; });
        setScores(scoreMap);
        setNotes(myEval.notes);
        setRecommendation(myEval.recommendation);
      } else {
        // Try to restore draft from localStorage
        const draftKey = DRAFT_KEY(applicationId, `new-${applicationId}-${user.id}`);
        const draft = localStorage.getItem(draftKey);
        if (draft) {
          try {
            const parsed = JSON.parse(draft);
            setScores(parsed.scores || {});
            setNotes(parsed.notes || '');
            setRecommendation(parsed.recommendation || 'Recommend');
          } catch {}
        }
        // Initialize all scores to 0
        const initScores: Record<string, number> = {};
        rubric.criteria.forEach(c => { initScores[c.id] = 0; });
        setScores(prev => ({ ...initScores, ...prev }));
      }
    }
    load();
  }, [applicationId, user]);


  // Autosave draft
  useEffect(() => {
    if (!existingEval && Object.keys(scores).length > 0) {
      const draftKey = DRAFT_KEY(applicationId, evalDraftId);
      localStorage.setItem(draftKey, JSON.stringify({ scores, notes, recommendation }));
    }
  }, [scores, notes, recommendation, applicationId, evalDraftId, existingEval]);

  const totalScore = calculateWeightedScore(
    criteria.map(c => ({
      criterionId: c.id,
      criterionName: c.name,
      score: scores[c.id] || 0,
      weight: c.weight,
    }))
  );

  async function save(isDraft: boolean) {
    if (!user || !application) return;
    setIsSaving(true);

    const evalScores: EvaluationScore[] = criteria.map(c => ({
      criterionId: c.id,
      criterionName: c.name,
      score: scores[c.id] || 0,
      weight: c.weight,
    }));

    const now = Date.now();
    if (existingEval) {
      await db.evaluations.update(existingEval.id, {
        scores: evalScores,
        totalScore,
        notes,
        recommendation,
        isDraft,
        updatedAt: now,
      });
      await logAudit(user.id, user.name, 'evaluation_updated', {
        applicationId,
        candidateId: application.candidateId,
      });
    } else {
      const newEval: Evaluation = {
        id: uuidv4(),
        applicationId,
        evaluatorId: user.id,
        rubricId,
        scores: evalScores,
        totalScore,
        notes,
        recommendation,
        isDraft,
        createdAt: now,
        updatedAt: now,
      };
      await db.evaluations.add(newEval);
      await logAudit(user.id, user.name, 'evaluation_submitted', {
        applicationId,
        candidateId: application.candidateId,
        position: application.position,
        details: `Score: ${totalScore}`,
      });

      // Update application status to Under Review
      if (application.status === 'Pending Review') {
        await db.applications.update(applicationId, { status: 'Under Review', updatedAt: now });
      }

      // Clear draft
      localStorage.removeItem(DRAFT_KEY(applicationId, evalDraftId));
    }

    setSavedMessage(isDraft ? 'Draft saved' : 'Evaluation submitted');
    setTimeout(() => setSavedMessage(''), 2000);
    setIsSaving(false);
  }

  if (!application || !candidate) {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
        <div className="bg-white rounded shadow-xl p-8 text-stone-400">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between shrink-0 bg-stone-50/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-stone-800 text-sm">Evaluate Application</span>
              {candidateIndex && totalCandidatesInQueue && (
                <span className="px-2 py-0.5 bg-navy-100 text-navy-800 rounded font-mono text-2xs font-medium">
                  {candidateIndex} of {totalCandidatesInQueue}
                </span>
              )}
            </div>
            {!cycle.blindEvaluation ? (
              <div className="text-xs text-stone-500 mt-0.5 font-medium">
                {candidate.fullName} <span className="text-stone-300">·</span> {application.position}
                {application.club && <span className="text-purple-600 ml-1">({application.club})</span>}
              </div>
            ) : (
              <div className="text-xs text-stone-400 mt-0.5">[Blind mode] · {application.position}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Candidate Nav Buttons in Header */}
            {(onPrevCandidate || onNextCandidate) && (
              <div className="flex items-center gap-0.5 mr-1 border border-stone-200 rounded-lg p-0.5 bg-white">
                <button
                  type="button"
                  onClick={onPrevCandidate}
                  disabled={!onPrevCandidate}
                  className="p-1 rounded text-stone-500 hover:text-stone-800 hover:bg-stone-100 disabled:opacity-30 disabled:pointer-events-none"
                  title="Previous Candidate"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={onNextCandidate}
                  disabled={!onNextCandidate}
                  className="p-1 rounded text-stone-500 hover:text-stone-800 hover:bg-stone-100 disabled:opacity-30 disabled:pointer-events-none"
                  title="Next Candidate"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            {existingEval && (
              <span className={`badge ${existingEval.isDraft ? 'badge-hold' : 'badge-selected'}`}>
                {existingEval.isDraft ? 'Draft' : 'Submitted'}
              </span>
            )}
            <button onClick={onClose} className="btn btn-ghost btn-sm p-1.5" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Application responses (showing all applied preferences if multiple) */}
          <div className="space-y-3">
            {allCandidateApps.length > 1 && (
              <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-lg overflow-x-auto">
                {allCandidateApps.map((app, i) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setSelectedAppId(app.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                      selectedAppId === app.id
                        ? 'bg-white text-navy-800 shadow-xs'
                        : 'text-stone-600 hover:text-navy-700'
                    }`}
                  >
                    <span>Pref #{app.preferenceOrder || (i + 1)}: {app.track}</span>
                    {app.club && <span className="text-2xs text-purple-600 ml-1">({app.club})</span>}
                  </button>
                ))}
              </div>
            )}

            {(() => {
              const activeApp = allCandidateApps.find(a => a.id === selectedAppId) || application;
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-stone-500 bg-stone-100/70 px-3 py-1.5 rounded">
                    <span className="font-medium text-stone-700">{activeApp.position}</span>
                    <span className="text-2xs text-stone-500">{activeApp.track} {activeApp.club && `· ${activeApp.club}`}</span>
                  </div>

                  {activeApp.pastExperience ? (
                    <div>
                      <div className="label text-xs">Past Experience</div>
                      <div className="text-xs md:text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded-lg p-3 max-h-36 overflow-y-auto">
                        {activeApp.pastExperience}
                      </div>
                    </div>
                  ) : (
                    <div className="text-2xs text-stone-400 italic bg-stone-50 p-2 rounded">
                      No specific past experience text provided for this section.
                    </div>
                  )}

                  {activeApp.whyChooseYou && (
                    <div>
                      <div className="label text-xs">Why Should We Choose You?</div>
                      <div className="text-xs md:text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded-lg p-3 max-h-36 overflow-y-auto">
                        {activeApp.whyChooseYou}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>


          {/* Rubric info */}
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <Info size={11} />
            <span>Score each criterion 0–10. Total is weighted automatically.</span>
          </div>

          {/* Criteria scores */}
          <div className="space-y-4">
            {criteria.map(criterion => (
              <div key={criterion.id} className="border border-stone-200 rounded-xl p-4 bg-white shadow-xs">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-semibold text-stone-800">{criterion.name}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{criterion.description}</div>
                  </div>
                  <div className="text-xs font-mono font-semibold text-navy-700 ml-4 shrink-0 bg-navy-50 px-2 py-0.5 rounded">
                    {criterion.weight}%
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={scores[criterion.id] || 0}
                    onChange={e => setScores(prev => ({ ...prev, [criterion.id]: parseInt(e.target.value) }))}
                    className="flex-1 accent-navy-700"
                    aria-label={`Score for ${criterion.name}`}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={scores[criterion.id] || 0}
                      onChange={e => {
                        const v = Math.max(0, Math.min(10, parseInt(e.target.value) || 0));
                        setScores(prev => ({ ...prev, [criterion.id]: v }));
                      }}
                      className="w-12 text-center text-sm font-mono border border-stone-200 rounded py-1 focus:outline-none focus:ring-1 focus:ring-navy-700 font-semibold"
                    />
                    <span className="text-xs text-stone-400">/10</span>
                  </div>
                  <div className="text-xs text-stone-500 font-mono w-16 text-right font-medium">
                    → {((scores[criterion.id] || 0) / 10 * criterion.weight).toFixed(1)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <div className="label text-xs">Evaluator Qualitative Notes</div>
            <div className="text-2xs text-stone-400 mb-1">
              Focus on concrete evidence: specific examples, demonstrated responsibility, measurable contributions.
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="input resize-none text-xs md:text-sm"
              placeholder="e.g. Demonstrates strong coordination leadership, structured articulation of priorities, and active involvement."
            />
          </div>

          {/* Recommendation */}
          <div>
            <div className="label text-xs">Recommendation</div>
            <div className="grid grid-cols-2 gap-2">
              {RECOMMENDATIONS.map(r => (
                <label
                  key={r}
                  className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer text-xs md:text-sm transition-colors ${
                    recommendation === r
                      ? 'border-navy-700 bg-navy-50 text-navy-800 font-medium shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 text-stone-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="recommendation"
                    value={r}
                    checked={recommendation === r}
                    onChange={() => setRecommendation(r)}
                    className="accent-navy-700"
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-stone-200 px-5 py-3.5 bg-stone-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ScoreDisplay score={totalScore} size="md" label="Overall Score" />
            {savedMessage && (
              <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                <Check size={13} />
                <span>{savedMessage}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary btn-sm text-xs"
              onClick={() => save(true)}
              disabled={isSaving}
            >
              Save Draft
            </button>
            <button
              className="btn btn-primary btn-sm text-xs font-semibold"
              onClick={async () => {
                await save(false);
                if (onNextCandidate) {
                  setTimeout(onNextCandidate, 500);
                }
              }}
              disabled={isSaving}
            >
              <Save size={13} />
              {isSaving ? 'Saving…' : onNextCandidate ? 'Submit & Next →' : 'Submit Evaluation'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

