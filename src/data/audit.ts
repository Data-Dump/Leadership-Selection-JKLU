import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import type { AuditAction, AuditEntry } from '../types';

export async function logAudit(
  userId: string,
  userName: string,
  action: AuditAction,
  details?: {
    candidateId?: string;
    candidateName?: string;
    applicationId?: string;
    position?: string;
    details?: string;
  }
): Promise<void> {
  const entry: AuditEntry = {
    id: uuidv4(),
    timestamp: Date.now(),
    userId,
    userName,
    action,
    ...details,
  };
  await db.auditLog.add(entry);
}

export async function setApplicationStatus(
  applicationId: string,
  status: string,
  userId: string,
  userName: string
): Promise<void> {
  const app = await db.applications.get(applicationId);
  if (!app) return;
  const candidate = await db.candidates.get(app.candidateId);
  const now = Date.now();

  await db.applications.update(applicationId, { status: status as never, updatedAt: now });

  const actionMap: Record<string, AuditAction> = {
    'Shortlisted': 'shortlisted',
    'Hold': 'held',
    'Rejected': 'rejected',
    'Selected': 'selected',
    'Waitlisted': 'waitlisted',
  };


  await logAudit(userId, userName, actionMap[status] || 'status_changed', {
    candidateId: app.candidateId,
    candidateName: candidate?.fullName,
    applicationId,
    position: app.position,
    details: `Status changed to "${status}"`,
  });
}
