import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { db } from '../data/db';
import { calculateAverageScore } from '../scoring/engine';
import { comparePositions } from './positionHierarchy';

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
    db.applications.where('status').equals('Shortlisted').toArray(),
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

export interface FinalSelectedRow {
  sNo: number;
  position: string;
  track: string;
  club: string;
  candidateName: string;
  rollNumber: string;
  batch: string;
  programme: string;
  email: string;
  phone: string;
  score: number | string;
  decision: string;
  decidedBy: string;
  decisionDate: string;
}

export async function getFormattedFinalSelectionData(selectedOnly = true): Promise<FinalSelectedRow[]> {
  const [applications, candidates, evaluations, decisions] = await Promise.all([
    db.applications.toArray(),
    db.candidates.toArray(),
    db.evaluations.filter(e => !e.isDraft).toArray(),
    db.finalDecisions.toArray(),
  ]);

  const candidateMap = new Map(candidates.map(c => [c.id, c]));
  const decisionMap = new Map(decisions.map(d => [d.applicationId, d]));

  // Filter applications
  const filteredApps = applications.filter(app => {
    const decision = decisionMap.get(app.id)?.finalDecision || app.status;
    if (selectedOnly) {
      return decision === 'Selected';
    }
    return decision === 'Selected' || decision === 'Waitlisted' || decision === 'Rejected';
  });

  // Sort by official Position Hierarchy
  const sortedApps = [...filteredApps].sort((a, b) => {
    return comparePositions(
      { name: a.position, club: a.club, track: a.track },
      { name: b.position, club: b.club, track: b.track }
    );
  });

  return sortedApps.map((app, index) => {
    const cand = candidateMap.get(app.candidateId);
    const appEvals = evaluations.filter(e => e.applicationId === app.id);
    const decision = decisionMap.get(app.id);
    const avgScore = calculateAverageScore(appEvals);

    return {
      sNo: index + 1,
      position: app.position,
      track: app.track,
      club: app.club || '—',
      candidateName: cand?.fullName || '—',
      rollNumber: cand?.rollNumber || '—',
      batch: cand?.batch || '—',
      programme: cand?.programme || '—',
      email: cand?.email || '—',
      phone: cand?.phone || '—',
      score: avgScore !== undefined ? avgScore : '—',
      decision: decision?.finalDecision || app.status,
      decidedBy: decision?.decidedBy || 'Selection Committee',
      decisionDate: decision?.decidedAt ? new Date(decision.decidedAt).toLocaleDateString('en-IN') : '—',
    };
  });
}

/**
 * Exports a beautifully formatted multi-sheet or single sheet Excel file
 */
export async function exportFinalSelectionExcel(selectedOnly = true) {
  const rows = await getFormattedFinalSelectionData(selectedOnly);
  if (rows.length === 0) {
    alert('No selected candidates found to export.');
    return;
  }

  const excelRows = rows.map(r => ({
    'S.No': r.sNo,
    'Position Title': r.position,
    'Track': r.track,
    'Club / Wing': r.club,
    'Selected Candidate': r.candidateName,
    'Roll Number': r.rollNumber,
    'Batch': r.batch,
    'Programme': r.programme,
    'Email Address': r.email,
    'Contact Number': r.phone,
    'Evaluation Score (100)': r.score,
    'Decision Status': r.decision,
    'Decided By': r.decidedBy,
    'Decision Date': r.decisionDate,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);

  // Column width formatting
  ws['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 34 }, // Position Title
    { wch: 18 }, // Track
    { wch: 22 }, // Club / Wing
    { wch: 26 }, // Candidate Name
    { wch: 16 }, // Roll Number
    { wch: 10 }, // Batch
    { wch: 16 }, // Programme
    { wch: 30 }, // Email
    { wch: 16 }, // Contact Number
    { wch: 22 }, // Evaluation Score
    { wch: 16 }, // Decision Status
    { wch: 20 }, // Decided By
    { wch: 14 }, // Decision Date
  ];

  const sheetName = selectedOnly ? 'Selected Council 2026-27' : 'Final Decisions';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
  const filename = selectedOnly
    ? 'JKLU_Student_Leadership_Selected_Council_2026_27.xlsx'
    : 'JKLU_Leadership_Selection_All_Decisions_2026_27.xlsx';
  saveAs(blob, filename);
}

/**
 * Exports formatted CSV
 */
export async function exportFinalSelectionCSV(selectedOnly = true) {
  const rows = await getFormattedFinalSelectionData(selectedOnly);
  if (rows.length === 0) {
    alert('No candidates found to export.');
    return;
  }

  const csvRows = rows.map(r => ({
    'S.No': r.sNo,
    'Position Title': r.position,
    'Track': r.track,
    'Club / Wing': r.club,
    'Selected Candidate': r.candidateName,
    'Roll Number': r.rollNumber,
    'Batch': r.batch,
    'Programme': r.programme,
    'Email Address': r.email,
    'Contact Number': r.phone,
    'Evaluation Score': r.score,
    'Decision Status': r.decision,
    'Decided By': r.decidedBy,
    'Decision Date': r.decisionDate,
  }));

  const filename = selectedOnly
    ? 'JKLU_Selected_Council_2026_27.csv'
    : 'JKLU_All_Decisions_2026_27.csv';

  downloadCSV(toCSV(csvRows), filename);
}

/**
 * Generate clean copyable announcement text formatted by Track
 */
export function generateAnnouncementMarkdown(rows: FinalSelectedRow[]): string {
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let text = `# JKLU STUDENT LEADERSHIP SELECTION (2026–27)\n`;
  text += `## OFFICIAL LIST OF SELECTED LEADERS & COUNCIL MEMBERS\n`;
  text += `*Date of Announcement: ${dateStr}*\n\n`;
  text += `Congratulations to all the selected candidates for the academic year 2026–27.\n\n`;

  const tracks = ['Student Council', 'Club Leadership', 'Coordinator'];

  tracks.forEach(track => {
    const trackRows = rows.filter(r => r.track === track && r.decision === 'Selected');
    if (trackRows.length > 0) {
      text += `### 🎓 ${track.toUpperCase()}\n`;
      text += `| S.No | Position | Selected Candidate | Roll No. | Programme / Batch |\n`;
      text += `| :--- | :--- | :--- | :--- | :--- |\n`;
      trackRows.forEach((r, i) => {
        const posText = r.club !== '—' ? `${r.position} (${r.club})` : r.position;
        text += `| ${i + 1} | ${posText} | **${r.candidateName}** | \`${r.rollNumber}\` | ${r.programme} ${r.batch} |\n`;
      });
      text += `\n`;
    }
  });

  text += `---\n*JKLU Student Affairs & Selection Committee*`;
  return text;
}
