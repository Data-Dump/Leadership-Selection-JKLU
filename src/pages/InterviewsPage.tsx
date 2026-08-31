import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { useAuth } from '../auth/AuthContext';
import { logAudit } from '../data/audit';
import { calculateInterviewScore } from '../scoring/engine';
import { PageHeader, ScoreDisplay, EmptyState } from '../components/shared/SharedComponents';
import { INTERVIEW_CRITERIA } from '../data/seed';
import { v4 as uuidv4 } from 'uuid';
import type { Application, Candidate, Interview, InterviewScore } from '../types';
import { Plus, X } from 'lucide-react';

interface InterviewRow {
  application: Application;
  candidate: Candidate;
  interview?: Interview;
}

export function InterviewsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recordingFor, setRecordingFor] = useState<InterviewRow | null>(null);

  // Form state
  const [interviewer, setInterviewer] = useState(user?.name || '');
  const [interviewDate, setInterviewDate] = useState('');
  const [location, setLocation] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    const [applications, candidates, interviews] = await Promise.all([
      db.applications.where('status').anyOf(['Shortlisted', 'Interview']).toArray(),
      db.candidates.toArray(),
      db.interviews.toArray(),
    ]);
    const candidateMap = new Map(candidates.map(c => [c.id, c]));
    const interviewMap = new Map(interviews.map(i => [i.applicationId, i]));

    setRows(
      applications
        .filter(a => candidateMap.has(a.candidateId))
        .map(app => ({
          application: app,
          candidate: candidateMap.get(app.candidateId)!,
          interview: interviewMap.get(app.id),
        }))
    );
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openRecord(row: InterviewRow) {
    setRecordingFor(row);
    setInterviewer(user?.name || '');
    setInterviewDate('');
    setLocation('');
    setStrengths('');
    setConcerns('');
    setNotes('');
    const init: Record<string, number> = {};
    INTERVIEW_CRITERIA.forEach(c => { init[c.criterionName] = 0; });
    if (row.interview) {
      row.interview.scores.forEach(s => { init[s.criterionName] = s.score; });
      setInterviewer(row.interview.interviewer);
      if (row.interview.interviewDate) {
        setInterviewDate(new Date(row.interview.interviewDate).toISOString().slice(0, 10));
      }
      setLocation(row.interview.location || '');
      setStrengths(row.interview.strengths || '');
      setConcerns(row.interview.concerns || '');
      setNotes(row.interview.notes || '');
    }
    setScores(init);
  }

  async function saveInterview() {
    if (!recordingFor || !user) return;
    setIsSaving(true);

    const interviewScores: InterviewScore[] = INTERVIEW_CRITERIA.map(c => ({
      criterionName: c.criterionName,
      score: scores[c.criterionName] || 0,
      weight: c.weight,
    }));
    const total = calculateInterviewScore(interviewScores);
    const now = Date.now();

    if (recordingFor.interview) {
      await db.interviews.update(recordingFor.interview.id, {
        interviewer, scores: interviewScores, totalScore: total,
        interviewDate: interviewDate ? new Date(interviewDate).getTime() : undefined,
        location, strengths, concerns, notes, updatedAt: now,
      });
    } else {
      const newInterview: Interview = {
        id: uuidv4(),
        applicationId: recordingFor.application.id,
        interviewer,
        interviewDate: interviewDate ? new Date(interviewDate).getTime() : undefined,
        location,
        scores: interviewScores,
        totalScore: total,
        strengths,
        concerns,
        notes,
        createdAt: now,
        updatedAt: now,
      };
      await db.interviews.add(newInterview);
      // Update application status to Interview
      await db.applications.update(recordingFor.application.id, { status: 'Interview', updatedAt: now });
    }

    await logAudit(user.id, user.name, 'interview_recorded', {
      applicationId: recordingFor.application.id,
      candidateId: recordingFor.candidate.id,
      candidateName: recordingFor.candidate.fullName,
      position: recordingFor.application.position,
      details: `Interview score: ${total}`,
    });

    setRecordingFor(null);
    setIsSaving(false);
    await load();
  }

  const totalInterviewScore = calculateInterviewScore(
    INTERVIEW_CRITERIA.map(c => ({ criterionName: c.criterionName, score: scores[c.criterionName] || 0, weight: c.weight }))
  );

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader title="Interviews" subtitle={`${rows.length} candidates shortlisted`} />
      <div className="p-6">
        {rows.length === 0 ? (
          <EmptyState title="No interviews scheduled" description="Shortlist candidates first, then move them to interview stage." />
        ) : (
          <div className="card">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Position</th>
                    <th>Interview Status</th>
                    <th>Interviewer</th>
                    <th>Date</th>
                    <th>Score</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.application.id}>
                      <td>
                        <Link to={`/candidates/${row.candidate.id}`} className="font-medium text-navy-700 hover:underline">
                          {row.candidate.fullName}
                        </Link>
                        <div className="text-xs text-stone-400">{row.candidate.rollNumber}</div>
                      </td>
                      <td>
                        <div className="text-sm">{row.application.position}</div>
                        {row.application.club && <div className="text-xs text-stone-400">{row.application.club}</div>}
                      </td>
                      <td>
                        {row.interview ? (
                          <span className="badge badge-interview">Recorded</span>
                        ) : (
                          <span className="badge badge-pending">Pending</span>
                        )}
                      </td>
                      <td className="text-sm text-stone-600">{row.interview?.interviewer || '—'}</td>
                      <td className="text-sm text-stone-500">
                        {row.interview?.interviewDate ? new Date(row.interview.interviewDate).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        {row.interview ? (
                          <ScoreDisplay score={row.interview.totalScore} size="sm" />
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={() => openRecord(row)}>
                          <Plus size={12} /> {row.interview ? 'Edit' : 'Record'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Interview recording panel */}
      {recordingFor && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setRecordingFor(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between shrink-0">
              <div>
                <div className="font-semibold text-stone-800 text-sm">Record Interview</div>
                <div className="text-xs text-stone-400">{recordingFor.candidate.fullName} · {recordingFor.application.position}</div>
              </div>
              <button onClick={() => setRecordingFor(null)} className="btn btn-ghost btn-sm"><X size={14} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Interviewer</label>
                  <input className="input" value={interviewer} onChange={e => setInterviewer(e.target.value)} />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="label">Location / Mode</label>
                  <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 301 / Online" />
                </div>
              </div>

              <div className="section-header">Interview Scores</div>
              {INTERVIEW_CRITERIA.map(c => (
                <div key={c.criterionName} className="border border-stone-100 rounded p-3">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-stone-700">{c.criterionName}</span>
                    <span className="text-xs text-stone-400">{c.weight}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={0} max={10} step={1}
                      value={scores[c.criterionName] || 0}
                      onChange={e => setScores(p => ({ ...p, [c.criterionName]: parseInt(e.target.value) }))}
                      className="flex-1 accent-navy-700"
                    />
                    <input
                      type="number" min={0} max={10}
                      value={scores[c.criterionName] || 0}
                      onChange={e => setScores(p => ({ ...p, [c.criterionName]: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) }))}
                      className="w-12 text-center text-sm font-mono border border-stone-200 rounded py-1 focus:outline-none focus:ring-1 focus:ring-navy-700"
                    />
                    <span className="text-xs text-stone-400">/10</span>
                  </div>
                </div>
              ))}

              <div>
                <label className="label">Strengths</label>
                <textarea className="input" rows={2} value={strengths} onChange={e => setStrengths(e.target.value)} placeholder="Key strengths observed during interview" />
              </div>
              <div>
                <label className="label">Concerns</label>
                <textarea className="input" rows={2} value={concerns} onChange={e => setConcerns(e.target.value)} placeholder="Concerns or areas requiring follow-up" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="shrink-0 border-t border-stone-200 px-5 py-4 bg-stone-50 flex items-center gap-3">
              <ScoreDisplay score={totalInterviewScore} label="Interview Score" />
              <button className="btn btn-primary ml-auto" onClick={saveInterview} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save Interview'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
