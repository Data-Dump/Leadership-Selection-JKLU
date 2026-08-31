// ============================================================
// Centralized Scoring Engine
// ALL score calculations live here — never duplicated
// ============================================================

import type {
  Evaluation,
  EvaluationScore,
  RubricCriterion,
  Interview,
  InterviewScore,
  SelectionCycle,
} from '../types';

export const DISAGREEMENT_THRESHOLD = 20; // points

/**
 * Calculate weighted score from rubric criterion scores.
 * Formula: sum of (score / maxScore) * weight for each criterion.
 * Result is 0-100.
 */
export function calculateWeightedScore(scores: EvaluationScore[]): number {
  if (!scores || scores.length === 0) return 0;
  const total = scores.reduce((sum, s) => {
    return sum + (s.score / 10) * s.weight;
  }, 0);
  return Math.round(total * 10) / 10; // round to 1 decimal
}

/**
 * Calculate interview score (same formula, different structure)
 */
export function calculateInterviewScore(scores: InterviewScore[]): number {
  if (!scores || scores.length === 0) return 0;
  const total = scores.reduce((sum, s) => {
    return sum + (s.score / 10) * s.weight;
  }, 0);
  return Math.round(total * 10) / 10;
}

/**
 * Calculate average of multiple evaluator scores
 */
export function calculateAverageScore(evaluations: Evaluation[]): number | undefined {
  const submitted = evaluations.filter(e => !e.isDraft);
  if (submitted.length === 0) return undefined;
  const sum = submitted.reduce((acc, e) => acc + e.totalScore, 0);
  return Math.round((sum / submitted.length) * 10) / 10;
}

/**
 * Calculate median score from evaluations
 */
export function calculateMedianScore(evaluations: Evaluation[]): number | undefined {
  const submitted = evaluations.filter(e => !e.isDraft);
  if (submitted.length === 0) return undefined;
  const sorted = [...submitted].sort((a, b) => a.totalScore - b.totalScore);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1].totalScore + sorted[mid].totalScore) / 2) * 10) / 10;
  }
  return sorted[mid].totalScore;
}

/**
 * Check if evaluators significantly disagree (>= DISAGREEMENT_THRESHOLD points)
 */
export function hasSignificantDisagreement(evaluations: Evaluation[]): boolean {
  const submitted = evaluations.filter(e => !e.isDraft);
  if (submitted.length < 2) return false;
  const scores = submitted.map(e => e.totalScore);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  return (max - min) >= DISAGREEMENT_THRESHOLD;
}

/**
 * Calculate final combined score using cycle weights.
 * Returns undefined if interview hasn't happened (and we shouldn't fabricate).
 */
export function calculateFinalScore(
  applicationScore: number,
  interviewScore: number | undefined,
  cycle: Pick<SelectionCycle, 'applicationWeight' | 'interviewWeight'>
): { score: number; isComplete: boolean } {
  if (interviewScore === undefined) {
    // Incomplete — return application score only as indicative, mark incomplete
    return {
      score: applicationScore,
      isComplete: false,
    };
  }
  const combined =
    (applicationScore * cycle.applicationWeight) / 100 +
    (interviewScore * cycle.interviewWeight) / 100;
  return {
    score: Math.round(combined * 10) / 10,
    isComplete: true,
  };
}

/**
 * Validate that rubric criterion weights sum to 100%
 */
export function validateRubricWeights(criteria: RubricCriterion[]): {
  valid: boolean;
  total: number;
  error?: string;
} {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(total - 100) > 0.01) {
    return {
      valid: false,
      total,
      error: `Criterion weights total ${total}% but must equal 100%.`,
    };
  }
  return { valid: true, total };
}

/**
 * Get score color class based on value
 */
export function getScoreColorClass(score: number): string {
  if (score >= 80) return 'text-green-700';
  if (score >= 60) return 'text-amber-700';
  if (score >= 40) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Get score background class
 */
export function getScoreBgClass(score: number): string {
  if (score >= 80) return 'bg-green-50 text-green-800';
  if (score >= 60) return 'bg-amber-50 text-amber-800';
  if (score >= 40) return 'bg-orange-50 text-orange-800';
  return 'bg-red-50 text-red-800';
}

/**
 * Rank applications within a position by their average score
 * Only ranks submitted evaluations, not drafts
 */
export function rankApplicationsInPosition(
  applicationScores: Array<{ applicationId: string; avgScore: number | undefined }>
): Array<{ applicationId: string; rank: number; avgScore: number | undefined }> {
  // Sort: scored first (descending), unscored at end
  const sorted = [...applicationScores].sort((a, b) => {
    if (a.avgScore === undefined && b.avgScore === undefined) return 0;
    if (a.avgScore === undefined) return 1;
    if (b.avgScore === undefined) return -1;
    return b.avgScore - a.avgScore;
  });

  return sorted.map((item, i) => ({
    ...item,
    rank: item.avgScore !== undefined ? i + 1 : 0,
  }));
}
