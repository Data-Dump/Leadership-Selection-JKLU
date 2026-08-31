import { clsx } from 'clsx';
import type { ApplicationStatus } from '../../types';

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; className: string }> = {
  'Pending Review': { label: 'Pending', className: 'badge-pending' },
  'Under Review':  { label: 'Under Review', className: 'badge-review' },
  'Shortlisted':   { label: 'Shortlisted', className: 'badge-shortlisted' },
  'Interview':     { label: 'Interview', className: 'badge-interview' },
  'Selected':      { label: 'Selected', className: 'badge-selected' },
  'Waitlisted':    { label: 'Waitlisted', className: 'badge-waitlisted' },
  'Hold':          { label: 'Hold', className: 'badge-hold' },
  'Rejected':      { label: 'Rejected', className: 'badge-rejected' },
};

interface StatusBadgeProps {
  status: ApplicationStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'badge-pending' };
  return (
    <span className={clsx(config.className, className)} aria-label={`Status: ${config.label}`}>
      {config.label}
    </span>
  );
}

interface ScoreDisplayProps {
  score?: number;
  size?: 'sm' | 'md' | 'lg';
  showBar?: boolean;
  label?: string;
}

export function ScoreDisplay({ score, size = 'md', showBar = false, label }: ScoreDisplayProps) {
  if (score === undefined) {
    return <span className="text-stone-400 text-sm">—</span>;
  }

  const colorClass =
    score >= 80 ? 'text-green-700' :
    score >= 60 ? 'text-amber-700' :
    score >= 40 ? 'text-orange-600' : 'text-red-600';

  const sizeClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-base';

  return (
    <div className="flex flex-col gap-1">
      {label && <div className="text-xs text-stone-400">{label}</div>}
      <div className={clsx('font-medium font-mono', sizeClass, colorClass)}>
        {score.toFixed(1)}
        {size !== 'sm' && <span className="text-stone-300 font-normal text-xs ml-0.5"> /100</span>}
      </div>
      {showBar && (
        <div className="score-bar w-20">
          <div className="score-bar-fill" style={{ width: `${score}%` }} />
        </div>
      )}
    </div>
  );
}

interface TrackBadgeProps {
  track: string;
  className?: string;
}

export function TrackBadge({ track, className }: TrackBadgeProps) {
  const config =
    track === 'Student Council' ? 'bg-navy-100 text-navy-700' :
    track === 'Club Leadership' ? 'bg-purple-50 text-purple-700' :
    'bg-teal-50 text-teal-700';

  return (
    <span className={clsx('badge', config, className)}>
      {track}
    </span>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="text-stone-300 text-3xl mb-3">—</div>
      <div className="font-medium text-stone-600 mb-1">{title}</div>
      <div className="text-sm text-stone-400 max-w-sm">{description}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, danger }: ConfirmDialogProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onCancel} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-stone-200 rounded shadow-xl w-96 overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="font-semibold text-stone-800 mb-2">{title}</h3>
          <p className="text-sm text-stone-600">{message}</p>
        </div>
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex justify-end gap-2">
          <button className="btn-secondary btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            className={danger ? 'btn-danger btn' : 'btn-primary btn'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between px-6 py-5 border-b border-stone-200 bg-white">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 ml-4">{actions}</div>}
    </div>
  );
}
