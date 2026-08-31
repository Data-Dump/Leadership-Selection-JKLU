import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { AlertTriangle, TrendingUp, Users, FileText, Star, Calendar, CheckSquare, Clock } from 'lucide-react';
import { PageHeader } from '../components/shared/SharedComponents';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ApplicationStatus } from '../types';

interface DashboardStats {
  totalCandidates: number;
  totalApplications: number;
  pendingReview: number;
  underReview: number;
  shortlisted: number;
  selected: number;
  rejected: number;
  evaluationsDone: number;
  applicationsByTrack: Array<{ track: string; count: number }>;
  applicationsByPosition: Array<{ position: string; track: string; count: number; evaluated: number; shortlisted: number }>;
  attentionItems: Array<{ type: string; message: string; severity: 'high' | 'medium'; link?: string }>;
}

const TRACK_COLORS: Record<string, string> = {
  'Student Council': '#1C2B4A',
  'Club Leadership': '#7C3AED',
  'Coordinator': '#0F766E',
};

const STATUS_STEPS = [
  { label: 'Applications', key: 'totalApplications', icon: FileText, color: 'text-stone-600' },
  { label: 'Evaluated', key: 'evaluationsDone', icon: TrendingUp, color: 'text-blue-600' },
  { label: 'Shortlisted', key: 'shortlisted', icon: Star, color: 'text-amber-600' },
  { label: 'Selected', key: 'selected', icon: CheckSquare, color: 'text-green-600' },
];

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [candidates, applications, evaluations, decisions, dqIssues] = await Promise.all([
        db.candidates.toArray(),
        db.applications.toArray(),
        db.evaluations.toArray(),
        db.finalDecisions.toArray(),
        db.dataQualityIssues.count(),
      ]);

      const countByStatus = (status: ApplicationStatus) =>
        applications.filter(a => a.status === status).length;

      // Applications by track
      const trackMap = new Map<string, number>();
      for (const app of applications) {
        trackMap.set(app.track, (trackMap.get(app.track) || 0) + 1);
      }
      const applicationsByTrack = Array.from(trackMap.entries()).map(([track, count]) => ({ track, count }));

      // Applications by position (top 15)
      const posMap = new Map<string, { track: string; count: number; evaluated: Set<string>; shortlisted: number }>();
      const evaluatedApps = new Set(evaluations.filter(e => !e.isDraft).map(e => e.applicationId));
      for (const app of applications) {
        const key = app.club ? `${app.position} (${app.club})` : app.position;
        if (!posMap.has(key)) posMap.set(key, { track: app.track, count: 0, evaluated: new Set(), shortlisted: 0 });
        const entry = posMap.get(key)!;
        entry.count++;
        if (evaluatedApps.has(app.id)) entry.evaluated.add(app.id);
        if (app.status === 'Shortlisted' || app.status === 'Selected') entry.shortlisted++;
      }
      const applicationsByPosition = Array.from(posMap.entries())
        .map(([position, d]) => ({ position, track: d.track, count: d.count, evaluated: d.evaluated.size, shortlisted: d.shortlisted }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Evaluations done = applications with at least 1 submitted evaluation
      const evaluationsDone = evaluatedApps.size;

      // Attention items
      const attentionItems: DashboardStats['attentionItems'] = [];
      const unevaluatedCount = applications.length - evaluationsDone;
      if (unevaluatedCount > 0) {
        attentionItems.push({
          type: 'unevaluated',
          message: `${unevaluatedCount} application${unevaluatedCount !== 1 ? 's' : ''} have not yet been evaluated.`,
          severity: 'high',
          link: '/evaluation',
        });
      }
      if (dqIssues > 0) {
        attentionItems.push({
          type: 'data_quality',
          message: `${dqIssues} data quality issue${dqIssues !== 1 ? 's' : ''} detected in the imported dataset.`,
          severity: 'medium',
          link: '/data-quality',
        });
      }

      // Disagreements
      const appEvalMap = new Map<string, number[]>();
      for (const ev of evaluations.filter(e => !e.isDraft)) {
        const arr = appEvalMap.get(ev.applicationId) || [];
        arr.push(ev.totalScore);
        appEvalMap.set(ev.applicationId, arr);
      }
      const disagreements = Array.from(appEvalMap.entries()).filter(([, scores]) => {
        if (scores.length < 2) return false;
        return Math.max(...scores) - Math.min(...scores) >= 20;
      }).length;
      if (disagreements > 0) {
        attentionItems.push({
          type: 'disagreement',
          message: `${disagreements} application${disagreements !== 1 ? 's have' : ' has'} significant evaluator disagreement (≥20 point gap).`,
          severity: 'high',
          link: '/candidates',
        });
      }


      setStats({
        totalCandidates: candidates.length,
        totalApplications: applications.length,
        pendingReview: countByStatus('Pending Review'),
        underReview: countByStatus('Under Review'),
        shortlisted: countByStatus('Shortlisted'),
        selected: countByStatus('Selected'),
        rejected: countByStatus('Rejected'),
        evaluationsDone,
        applicationsByTrack,
        applicationsByPosition,
        attentionItems,
      });
      setIsLoading(false);
    }
    load();
  }, []);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-stone-400 text-sm">
        Loading dashboard…
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div>
      <PageHeader
        title="JKLU Student Leadership Selection"
        subtitle="2026–27 Selection Cycle"
      />

      <div className="p-6 space-y-6">

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Candidates', value: stats.totalCandidates, icon: Users, color: 'text-navy-700' },
            { label: 'Applications', value: stats.totalApplications, icon: FileText, color: 'text-stone-700' },
            { label: 'Pending Review', value: stats.pendingReview + stats.underReview, icon: Clock, color: 'text-orange-600' },
            { label: 'Shortlisted', value: stats.shortlisted, icon: Star, color: 'text-amber-600' },
            { label: 'Selected', value: stats.selected, icon: CheckSquare, color: 'text-green-600' },
          ].map(stat => (
            <div key={stat.label} className="card p-4">
              <div className={`mb-2 ${stat.color}`}>
                <stat.icon size={16} />
              </div>
              <div className={`text-2xl font-semibold font-mono ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-stone-400 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Applications by Track */}
          <div className="card p-5">
            <div className="section-header">Applications by Track</div>
            <div className="space-y-3">
              {stats.applicationsByTrack.map(item => (
                <div key={item.track}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-stone-700">{item.track}</span>
                    <span className="text-sm font-medium font-mono text-stone-600">{item.count}</span>
                  </div>
                  <div className="score-bar">
                    <div
                      className="h-full rounded transition-all"
                      style={{
                        width: `${(item.count / stats.totalApplications) * 100}%`,
                        backgroundColor: TRACK_COLORS[item.track] || '#78716c',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selection Pipeline */}
          <div className="card p-5">
            <div className="section-header">Selection Pipeline</div>
            <div className="space-y-2">
              {STATUS_STEPS.map((step, i) => {
                const value = stats[step.key as keyof DashboardStats] as number;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className={`${step.color} shrink-0`}><step.icon size={14} /></div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-stone-600">{step.label}</span>
                        <span className="text-xs font-mono text-stone-700">{value}</span>
                      </div>
                      <div className="score-bar">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${stats.totalApplications > 0 ? (value / stats.totalApplications) * 100 : 0}%`,
                            backgroundColor: step.color.replace('text-', '').replace('-600', ''),
                          }}
                        />
                      </div>
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div className="text-stone-300 text-xs shrink-0">→</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Attention Required */}
          <div className="card p-5">
            <div className="section-header">Attention Required</div>
            {stats.attentionItems.length === 0 ? (
              <div className="text-sm text-stone-400">No issues detected.</div>
            ) : (
              <div className="space-y-2">
                {stats.attentionItems.map((item, i) => (
                  <div key={i} className={`p-3 rounded text-xs flex gap-2 ${
                    item.severity === 'high' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                  }`}>
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <span>
                      {item.message}
                      {item.link && (
                        <Link to={item.link} className="ml-1 underline hover:no-underline">View →</Link>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Applications by Position */}
        <div className="card">
          <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
            <div className="section-header mb-0">Applications by Position</div>
            <Link to="/positions" className="text-xs text-navy-600 hover:underline">View all positions →</Link>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Track</th>
                  <th className="text-right">Applications</th>
                  <th className="text-right">Evaluated</th>
                  <th className="text-right">Shortlisted</th>
                </tr>
              </thead>
              <tbody>
                {stats.applicationsByPosition.map(pos => (
                  <tr key={pos.position}>
                    <td className="font-medium text-stone-800">
                      <Link to={`/positions?q=${encodeURIComponent(pos.position)}`} className="hover:text-navy-700 hover:underline">
                        {pos.position}
                      </Link>
                    </td>
                    <td>
                      <span className="text-xs text-stone-500">{pos.track}</span>
                    </td>
                    <td className="text-right font-mono text-sm">{pos.count}</td>
                    <td className="text-right font-mono text-sm text-blue-600">{pos.evaluated}</td>
                    <td className="text-right font-mono text-sm text-amber-600">{pos.shortlisted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
