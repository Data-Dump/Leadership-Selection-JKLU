import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { PageHeader } from '../components/shared/SharedComponents';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Users, Award, CheckCircle } from 'lucide-react';

export function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [evaluatorActivity, setEvaluatorActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [applications, evaluations, interviews, evaluatorsList] = await Promise.all([
        db.applications.toArray(),
        db.evaluations.filter(e => !e.isDraft).toArray(),
        db.interviews.toArray(),
        db.evaluators.toArray(),
      ]);

      // By position
      const posMap = new Map<string, number>();
      applications.forEach(a => posMap.set(a.position, (posMap.get(a.position) || 0) + 1));
      const byPosition = Array.from(posMap.entries())
        .map(([position, count]) => ({ position: position.length > 20 ? position.slice(0, 20) + '…' : position, count }))
        .sort((a, b) => b.count - a.count).slice(0, 12);

      // By club
      const clubMap = new Map<string, number>();
      applications.filter(a => a.club).forEach(a => clubMap.set(a.club!, (clubMap.get(a.club!) || 0) + 1));
      const byClub = Array.from(clubMap.entries()).map(([club, count]) => ({ club, count })).sort((a, b) => b.count - a.count);

      // By batch
      const batchMap = new Map<string, number>();
      const candidates = await db.candidates.toArray();
      candidates.forEach(c => {
        if (c.batch) batchMap.set(c.batch, (batchMap.get(c.batch) || 0) + 1);
      });
      const byBatch = Array.from(batchMap.entries()).map(([batch, count]) => ({ batch, count })).sort((a, b) => a.batch.localeCompare(b.batch));

      // Status distribution
      const statusMap = new Map<string, number>();
      applications.forEach(a => statusMap.set(a.status, (statusMap.get(a.status) || 0) + 1));
      const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

      // Avg score by track
      const trackScores = new Map<string, number[]>();
      for (const ev of evaluations) {
        const app = applications.find(a => a.id === ev.applicationId);
        if (app) {
          const arr = trackScores.get(app.track) || [];
          arr.push(ev.totalScore);
          trackScores.set(app.track, arr);
        }
      }
      const avgByTrack = Array.from(trackScores.entries()).map(([track, scores]) => ({
        track,
        avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        count: scores.length,
      }));

      // Evaluation completion
      const evalledApps = new Set(evaluations.map(e => e.applicationId));
      const evalCompletion = Math.round((evalledApps.size / applications.length) * 100);

      // Evaluator activity stats
      const evalStats = evaluatorsList.map(ev => {
        const evals = evaluations.filter(e => e.evaluatorId === ev.id);
        const avg = evals.length > 0
          ? Math.round(evals.reduce((acc, curr) => acc + curr.totalScore, 0) / evals.length)
          : undefined;
        return {
          id: ev.id,
          name: ev.name,
          role: ev.role,
          count: evals.length,
          avgScore: avg,
        };
      }).sort((a, b) => b.count - a.count);

      setEvaluatorActivity(evalStats);
      setData({ byPosition, byClub, byBatch, byStatus, avgByTrack, evalCompletion, totalApps: applications.length, totalEvals: evaluations.length, totalEvaluators: evaluatorsList.length });
      setIsLoading(false);
    }
    load();
  }, []);

  const STATUS_COLORS: Record<string, string> = {
    'Pending Review': '#a8a29e',
    'Under Review': '#60a5fa',
    'Shortlisted': '#f59e0b',
    'Interview': '#a78bfa',
    'Selected': '#34d399',
    'Waitlisted': '#fbbf24',
    'Hold': '#fb923c',
    'Rejected': '#f87171',
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading analytics…</div>;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Analytics & Evaluator Activity" subtitle="Selection process and multi-evaluator analytics" />
      <div className="p-6 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Applications', value: data.totalApps },
            { label: 'Evaluations Submitted', value: data.totalEvals },
            { label: 'Evaluators in Panel', value: data.totalEvaluators },
            { label: 'Evaluation Coverage', value: `${data.evalCompletion}%` },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className="text-2xl font-semibold text-navy-700 font-mono">{s.value}</div>
              <div className="text-xs text-stone-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Evaluator Activity Table */}
        <div className="card">
          <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
            <div className="section-header mb-0">Evaluator Progress & Centralized Scoring Activity</div>
            <span className="text-xs text-stone-400 font-mono">{evaluatorActivity.length} evaluators registered</span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Evaluator</th>
                  <th>Role</th>
                  <th>Evaluations Completed</th>
                  <th>Average Score Given</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {evaluatorActivity.map(ev => {
                  const pct = data.totalApps > 0 ? Math.round((ev.count / data.totalApps) * 100) : 0;
                  return (
                    <tr key={ev.id}>
                      <td className="font-medium text-stone-800">{ev.name}</td>
                      <td>
                        <span className="badge bg-stone-100 text-stone-700 text-2xs">{ev.role}</span>
                      </td>
                      <td>
                        <span className="font-mono text-sm font-semibold text-navy-700">{ev.count}</span>
                        <span className="text-xs text-stone-400 ml-1">/ {data.totalApps}</span>
                      </td>
                      <td>
                        {ev.avgScore !== undefined ? (
                          <span className="font-mono text-sm text-stone-800">{ev.avgScore}/100</span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="w-48">
                        <div className="flex items-center gap-2">
                          <div className="score-bar flex-1">
                            <div
                              className="h-full rounded bg-navy-700 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-2xs font-mono text-stone-500 w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Applications by position */}
          <div className="card p-5">
            <div className="section-header">Applications by Position (Top 12)</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.byPosition} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="position" tick={{ fontSize: 10 }} width={130} />
                <Tooltip />
                <Bar dataKey="count" fill="#1C2B4A" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Status distribution */}
          <div className="card p-5">
            <div className="section-header">Application Status Distribution</div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={100} label={(entry: any) => `${entry.status}: ${entry.count}`} labelLine={false} fontSize={10}>
                  {data.byStatus.map((entry: any) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#a8a29e'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* By club */}
          {data.byClub.length > 0 && (
            <div className="card p-5">
              <div className="section-header">Club Applications</div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.byClub} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="club" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#7C3AED" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By batch */}
          <div className="card p-5">
            <div className="section-header">Candidates by Batch</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.byBatch} margin={{ left: 0, right: 20 }}>
                <XAxis dataKey="batch" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0F766E" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Average scores by track */}
        {data.avgByTrack.length > 0 && (
          <div className="card p-5">
            <div className="section-header">Average Evaluation Scores by Track</div>
            <div className="flex gap-6">
              {data.avgByTrack.map((t: any) => (
                <div key={t.track} className="flex-1 text-center p-4 bg-stone-50 rounded">
                  <div className="text-2xl font-mono font-semibold text-navy-700">{t.avg}</div>
                  <div className="text-sm text-stone-600 mt-1">{t.track}</div>
                  <div className="text-xs text-stone-400">{t.count} evaluations</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

