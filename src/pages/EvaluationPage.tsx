import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { PageHeader, StatusBadge, ScoreDisplay, EmptyState } from '../components/shared/SharedComponents';
import { EvaluationPanel } from '../components/evaluation/EvaluationPanel';
import { useAuth } from '../auth/AuthContext';
import { calculateAverageScore } from '../scoring/engine';
import type { Application, Candidate, Evaluation } from '../types';

interface EvalQueueRow {
  application: Application;
  candidate: Candidate;
  myEvaluation?: Evaluation;
  submittedEvals: Evaluation[];
  avgScore?: number;
}

export function EvaluationPage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<EvalQueueRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'done'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [evalAppId, setEvalAppId] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  async function load() {
    if (!user) return;
    const [applications, candidates, evaluations] = await Promise.all([
      db.applications.where('status').notEqual('Rejected').toArray(),
      db.candidates.toArray(),
      db.evaluations.toArray(),
    ]);
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    const rows: EvalQueueRow[] = applications
      .filter(a => candidateMap.has(a.candidateId))
      .map(app => {
        const appEvals = evaluations.filter(e => e.applicationId === app.id);
        const submitted = appEvals.filter(e => !e.isDraft);
        const myEval = appEvals.find(e => e.evaluatorId === user.id);
        return {
          application: app,
          candidate: candidateMap.get(app.candidateId)!,
          myEvaluation: myEval,
          submittedEvals: submitted,
          avgScore: calculateAverageScore(submitted),
        };
      });

    setQueue(rows);
    setIsLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  const filtered = queue.filter(row => {
    if (activeFilter === 'pending') return !row.myEvaluation || row.myEvaluation.isDraft;
    if (activeFilter === 'done') return row.myEvaluation && !row.myEvaluation.isDraft;
    return true;
  });

  function openEval(idx: number) {
    setCurrentIdx(idx);
    setEvalAppId(filtered[idx].application.id);
  }

  function handleClose() {
    setEvalAppId(null);
    load();
  }

  const pendingCount = queue.filter(r => !r.myEvaluation || r.myEvaluation.isDraft).length;
  const doneCount = queue.filter(r => r.myEvaluation && !r.myEvaluation.isDraft).length;

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading evaluation queue…</div>;

  return (
    <div>
      <PageHeader
        title="Evaluation Queue"
        subtitle={`${pendingCount} pending · ${doneCount} submitted`}
      />
      <div className="p-6">
        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 border-b border-stone-200">
          {[
            { key: 'pending', label: `Pending (${pendingCount})` },
            { key: 'done', label: `Submitted (${doneCount})` },
            { key: 'all', label: `All (${queue.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key as never)}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                activeFilter === tab.key
                  ? 'border-navy-700 text-navy-700 font-medium'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={activeFilter === 'pending' ? 'All caught up' : 'No evaluations yet'}
            description={
              activeFilter === 'pending'
                ? 'You have submitted evaluations for all applications in your queue.'
                : 'Start reviewing applications to generate evaluations.'
            }
          />
        ) : (
          <div className="card">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Position</th>
                    <th>Track</th>
                    <th>Status</th>
                    <th>My Status</th>
                    <th>My Score</th>
                    <th>Avg Score</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, idx) => (
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
                      <td className="text-xs text-stone-500">{row.application.track}</td>
                      <td><StatusBadge status={row.application.status} /></td>
                      <td>
                        {!row.myEvaluation ? (
                          <span className="text-xs text-stone-400">Not started</span>
                        ) : row.myEvaluation.isDraft ? (
                          <span className="badge badge-hold">Draft</span>
                        ) : (
                          <span className="badge badge-selected">Submitted</span>
                        )}
                      </td>
                      <td>
                        {row.myEvaluation && !row.myEvaluation.isDraft ? (
                          <ScoreDisplay score={row.myEvaluation.totalScore} size="sm" />
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      <td><ScoreDisplay score={row.avgScore} size="sm" /></td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => openEval(idx)}
                        >
                          {row.myEvaluation ? (row.myEvaluation.isDraft ? 'Continue' : 'Edit') : 'Evaluate'}
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

      {evalAppId && (
        <EvaluationPanel
          applicationId={evalAppId}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
