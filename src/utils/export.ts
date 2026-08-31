import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { db } from '../data/db';
import { calculateAverageScore, calculateFinalScore } from '../scoring/engine';

function toCSV(rows: object[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = (row as Record<string, unknown>)[h];
        if (val === undefined || val === null) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
      }).join(',')
    ),
  ];
  return lines.join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, filename);
}

export async function exportCandidateList() {
  const [candidates, applications] = await Promise.all([
    db.candidates.toArray(),
    db.applications.toArray(),
  ]);

  const rows = candidates.map(c => {
    const primaryApp = applications.find(a => a.candidateId === c.id && a.preferenceOrder === 1);
    return {
      'Roll Number': c.rollNumber,
      'Full Name': c.fullName,
      'Email': c.email,
      'Phone': c.phone || '',
      'Programme': c.programme || '',
      'Batch': c.batch || '',
      'Primary Position': primaryApp?.position || '',
      'Track': primaryApp?.track || '',
      'Club': primaryApp?.club || '',
      'Status': primaryApp?.status || '',
    };
  });

  downloadCSV(toCSV(rows), 'jklu-candidates.csv');
}

export async function exportEvaluationResults() {
  const [applications, candidates, evaluations, evaluators] = await Promise.all([
    db.applications.toArray(),
    db.candidates.toArray(),
    db.evaluations.filter(e => !e.isDraft).toArray(),
    db.evaluators.toArray(),
  ]);

  const candidateMap = new Map(candidates.map(c => [c.id, c]));
  const evaluatorMap = new Map(evaluators.map(e => [e.id, e]));

  const rows = evaluations.map(ev => {
    const app = applications.find(a => a.id === ev.applicationId);
    const cand = app ? candidateMap.get(app.candidateId) : undefined;
    const evaluator = evaluatorMap.get(ev.evaluatorId);
    return {
      'Candidate': cand?.fullName || '',
      'Roll Number': cand?.rollNumber || '',
      'Position': app?.position || '',
      'Track': app?.track || '',
      'Evaluator': evaluator?.name || '',
      'Total Score': ev.totalScore,
      'Recommendation': ev.recommendation,
      'Notes': ev.notes,
      'Date': new Date(ev.createdAt).toLocaleDateString(),
    };
  });

  downloadCSV(toCSV(rows), 'jklu-evaluations.csv');
}

export async function exportShortlist() {
  const [applications, candidates, evaluations] = await Promise.all([
    db.applications.where('status').anyOf(['Shortlisted', 'Interview']).toArray(),
    db.candidates.toArray(),
    db.evaluations.filter(e => !e.isDraft).toArray(),
  ]);

  const candidateMap = new Map(candidates.map(c => [c.id, c]));

  const rows = applications.map(app => {
    const cand = candidateMap.get(app.candidateId);
    const appEvals = evaluations.filter(e => e.applicationId === app.id);
    const avgScore = calculateAverageScore(appEvals);
    return {
      'Candidate': cand?.fullName || '',
      'Roll Number': cand?.rollNumber || '',
      'Position': app.position,
      'Track': app.track,
      'Club': app.club || '',
      'Status': app.status,
      'Evaluations': appEvals.length,
      'Average Score': avgScore?.toFixed(1) || '',
    };
  });

  downloadCSV(toCSV(rows), 'jklu-shortlist.csv');
}

export async function exportFinalSelection() {
  const [applications, candidates, evaluations, interviews, decisions] = await Promise.all([
    db.applications.where('status').anyOf(['Selected', 'Waitlisted', 'Rejected']).toArray(),
    db.candidates.toArray(),
    db.evaluations.filter(e => !e.isDraft).toArray(),
    db.interviews.toArray(),
    db.finalDecisions.toArray(),
  ]);

  const candidateMap = new Map(candidates.map(c => [c.id, c]));
  const decisionMap = new Map(decisions.map(d => [d.applicationId, d]));
  const cycle = await db.selectionCycles.where('active').equals(1).first();
  const weights = cycle || { applicationWeight: 70, interviewWeight: 30 };

  const rows = applications.map(app => {
    const cand = candidateMap.get(app.candidateId);
    const appEvals = evaluations.filter(e => e.applicationId === app.id);
    const interview = interviews.find(i => i.applicationId === app.id);
    const decision = decisionMap.get(app.id);
    const appScore = calculateAverageScore(appEvals);
    const { score: finalScore, isComplete } = appScore !== undefined
      ? calculateFinalScore(appScore, interview?.totalScore, weights)
      : { score: 0, isComplete: false };

    return {
      'Candidate': cand?.fullName || '',
      'Roll Number': cand?.rollNumber || '',
      'Position': app.position,
      'Track': app.track,
      'Application Score': appScore?.toFixed(1) || '',
      'Interview Score': interview?.totalScore?.toFixed(1) || 'N/A',
      'Final Score': isComplete ? finalScore.toFixed(1) : 'Incomplete',
      'Decision': decision?.finalDecision || app.status,
      'Decided By': decision?.decidedBy || '',
      'Date': decision ? new Date(decision.decidedAt).toLocaleDateString() : '',
    };
  });

  downloadCSV(toCSV(rows), 'jklu-final-selection.csv');
}
