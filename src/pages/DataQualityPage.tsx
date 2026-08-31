import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { PageHeader, EmptyState } from '../components/shared/SharedComponents';
import type { DataQualityIssue, DataQualitySeverity } from '../types';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';

const SEVERITY_CONFIG: Record<DataQualitySeverity, { label: string; icon: React.ElementType; className: string; rowClass: string }> = {
  Critical: { label: 'Critical', icon: AlertCircle, className: 'text-red-700', rowClass: 'bg-red-50 border-red-200' },
  Warning:  { label: 'Warning',  icon: AlertTriangle, className: 'text-amber-700', rowClass: 'bg-amber-50 border-amber-200' },
  Info:     { label: 'Info',     icon: Info, className: 'text-blue-700', rowClass: 'bg-blue-50 border-blue-200' },
};

export function DataQualityPage() {
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);
  const [filter, setFilter] = useState<DataQualitySeverity | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    db.dataQualityIssues.toArray().then(data => {
      setIssues(data);
      setIsLoading(false);
    });
  }, []);

  const filtered = filter === 'all' ? issues : issues.filter(i => i.severity === filter);
  const criticalCount = issues.filter(i => i.severity === 'Critical').length;
  const warningCount = issues.filter(i => i.severity === 'Warning').length;
  const infoCount = issues.filter(i => i.severity === 'Info').length;

  if (isLoading) return <div className="flex items-center justify-center h-64 text-stone-400 text-sm">Loading…</div>;

  return (
    <div>
      <PageHeader title="Data Quality" subtitle="Issues detected during CSV import" />
      <div className="p-6">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Issues', value: issues.length, className: 'text-stone-700' },
            { label: 'Critical', value: criticalCount, className: 'text-red-700' },
            { label: 'Warnings', value: warningCount, className: 'text-amber-700' },
            { label: 'Info', value: infoCount, className: 'text-blue-700' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className={`text-2xl font-mono font-semibold ${s.className}`}>{s.value}</div>
              <div className="text-xs text-stone-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 border-b border-stone-200">
          {(['all', 'Critical', 'Warning', 'Info'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                filter === f ? 'border-navy-700 text-navy-700 font-medium' : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {f === 'all' ? `All (${issues.length})` : `${f} (${f === 'Critical' ? criticalCount : f === 'Warning' ? warningCount : infoCount})`}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No issues found" description="The dataset passed all quality checks." />
        ) : (
          <div className="space-y-2">
            {filtered.map(issue => {
              const config = SEVERITY_CONFIG[issue.severity];
              return (
                <div key={issue.id} className={`flex items-start gap-3 p-3 rounded border ${config.rowClass}`}>
                  <config.icon size={14} className={`${config.className} shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${config.className}`}>{issue.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                    <div className="text-sm text-stone-700 mt-0.5">{issue.description}</div>
                    <div className="text-xs text-stone-400 mt-1 flex gap-3">
                      {issue.sourceRow && <span>CSV Row {issue.sourceRow}</span>}
                      {issue.field && <span>Field: {issue.field}</span>}
                      {issue.value && <span>Value: <code className="font-mono bg-white px-1 rounded">{issue.value}</code></span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
