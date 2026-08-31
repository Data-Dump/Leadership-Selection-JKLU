import { useEffect, useState, useCallback } from 'react';
import { db } from '../../data/db';
import { useAuth } from '../../auth/AuthContext';
import { calculateWeightedScore } from '../../scoring/engine';
import { logAudit } from '../../data/audit';
import { v4 as uuidv4 } from 'uuid';
import type { Application, Candidate, RubricCriterion, Evaluation, EvaluationScore, RecommendationType } from '../../types';
import { X, Save, Info } from 'lucide-react';
import { ScoreDisplay } from '../shared/SharedComponents';

const DRAFT_KEY = (appId: string, evalId: string) => `jklu_eval_draft_${appId}_${evalId}`;

const RECOMMENDATIONS: RecommendationType[] = [
  'Strongly Recommend', 'Recommend', 'Hold', 'Do Not Recommend'
];

interface Props {
  applicationId: string;
  onClose: () => void;
}

export function EvaluationPanel({ applicationId, onClose }: Props) {
  const { user } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
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

      const cand = await db.candidates.get(app.candidateId);
      setCandidate(cand || null);

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
        <div className="px-5 py-4 border-b border-stone-200 flex items-start justify-between shrink-0">
          <div>
            <div className="font-semibold text-stone-800 text-sm">Evaluate Application</div>
            {!cycle.blindEvaluation ? (
              <div className="text-xs text-stone-400 mt-0.5">{candidate.fullName} · {application.position}</div>
            ) : (
              <div className="text-xs text-stone-400 mt-0.5">[Blind mode] · {application.position}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {existingEval && (
              <span className={`badge ${existingEval.isDraft ? 'badge-hold' : 'badge-selected'}`}>
                {existingEval.isDraft ? 'Draft' : 'Submitted'}
              </span>
            )}
            <button onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Application responses (always shown even in blind mode) */}
          <div className="space-y-3">
            {application.pastExperience && (
              <div>
                <div className="label">Past Experience</div>
                <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded p-3 max-h-36 overflow-y-auto">
                  {application.pastExperience}
                </div>
              </div>
            )}
            {application.whyChooseYou && (
              <div>
                <div className="label">Why Should We Choose You?</div>
                <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded p-3 max-h-36 overflow-y-auto">
                  {application.whyChooseYou}
                </div>
              </div>
            )}
          </div>

          {/* Rubric info */}
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <Info size={11} />
            <span>Score each criterion 0–10. Total is weighted automatically.</span>
          </div>

          {/* Criteria scores */}
          <div className="space-y-4">
            {criteria.map(criterion => (
              <div key={criterion.id} className="border border-stone-100 rounded p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-stone-800">{criterion.name}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{criterion.description}</div>
                  </div>
                  <div className="text-xs text-stone-400 ml-4 shrink-0">{criterion.weight}%</div>
                </div>
                <div className="flex items-center gap-3">
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
                      className="w-12 text-center text-sm font-mono border border-stone-200 rounded py-1 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    />
                    <span className="text-xs text-stone-400">/10</span>
                  </div>
                  <div className="text-xs text-stone-400 w-16 text-right">
                    → {((scores[criterion.id] || 0) / 10 * criterion.weight).toFixed(1)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <div className="label">Evaluator Notes</div>
            <div className="text-xs text-stone-400 mb-1">
              Focus on concrete evidence: specific examples, demonstrated responsibility, measurable contributions.
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              className="input resize-none"
              placeholder="e.g. Has previously managed a 12-person event team and gives a concrete example of resolving a coordination issue."
            />
          </div>

          {/* Recommendation */}
          <div>
            <div className="label">Recommendation</div>
            <div className="grid grid-cols-2 gap-2">
              {RECOMMENDATIONS.map(r => (
                <label
                  key={r}
                  className={`flex items-center gap-2 p-2.5 border rounded cursor-pointer text-sm transition-colors ${
                    recommendation === r
                      ? 'border-navy-700 bg-navy-50 text-navy-800'
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
        <div className="shrink-0 border-t border-stone-200 px-5 py-4 bg-stone-50 flex items-center gap-3">
          <div className="flex-1">
            <ScoreDisplay score={totalScore} size="md" label="Overall Score" />
          </div>
          {savedMessage && (
            <span className="text-xs text-green-600 font-medium">{savedMessage}</span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => save(true)}
            disabled={isSaving}
          >
            Save Draft
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => save(false)}
            disabled={isSaving}
          >
            <Save size={12} />
            {isSaving ? 'Saving…' : 'Submit Evaluation'}
          </button>
        </div>
      </div>
    </>
  );
}
