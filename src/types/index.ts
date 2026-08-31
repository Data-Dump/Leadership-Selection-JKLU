// ============================================================
// JKLU Selection System — Core Type Definitions
// ============================================================

export type ApplicationStatus =
  | 'Pending Review'
  | 'Under Review'
  | 'Shortlisted'
  | 'Interview'
  | 'Selected'
  | 'Waitlisted'
  | 'Hold'
  | 'Rejected';

export type Track = 'Student Council' | 'Club Leadership' | 'Coordinator';

export type FinalDecisionType = 'Selected' | 'Waitlisted' | 'Rejected';

export type RecommendationType =
  | 'Strongly Recommend'
  | 'Recommend'
  | 'Hold'
  | 'Do Not Recommend';

export type UserRole = 'Super Admin' | 'Admin' | 'Evaluator' | 'Viewer' | 'Interviewer';

export type AuditAction =
  | 'imported'
  | 'shortlisted'
  | 'held'
  | 'rejected'
  | 'moved_to_interview'
  | 'selected'
  | 'waitlisted'
  | 'evaluation_submitted'
  | 'evaluation_updated'
  | 'interview_recorded'
  | 'final_decision'
  | 'note_added'
  | 'status_changed';

export type DataQualitySeverity = 'Critical' | 'Warning' | 'Info';

// ============================================================
// CANDIDATE
// ============================================================
export interface Candidate {
  id: string;
  fullName: string;
  rollNumber: string;
  email: string;
  phone?: string;
  batch?: string;        // e.g., "2024", "2025", "2026"
  programme?: string;   // e.g., "BTech", "BBA"
  nameNormalized: string; // lowercase for search
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// APPLICATION
// ============================================================
export interface Application {
  id: string;
  candidateId: string;
  track: Track;
  position: string;       // e.g., "General Secretary - Batch 2024"
  positionNormalized: string;
  club?: string;           // For Club Leadership track
  preferenceOrder: number; // 1 = primary, 2 = secondary, etc.
  areaOfInterest?: string;
  pastExperience?: string;
  whyChooseYou?: string;
  nextPreference?: string;
  sourceRow: number;       // Original CSV row ID for traceability
  sourceSection: 'A' | 'B' | 'C'; // Which section of the CSV row
  status: ApplicationStatus;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// EVALUATOR
// ============================================================
export interface Evaluator {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  passwordHash?: string; // demo: plain text prefix "demo:"
  createdAt: number;
}

// ============================================================
// RUBRIC CRITERION
// ============================================================
export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number; // percentage, e.g. 25 means 25%
  maxScore: number; // always 10
}

export interface Rubric {
  id: string;
  name: string;
  positionId?: string; // null = default rubric
  criteria: RubricCriterion[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// EVALUATION
// ============================================================
export interface EvaluationScore {
  criterionId: string;
  criterionName: string;
  score: number; // 0-10
  weight: number;
}

export interface Evaluation {
  id: string;
  applicationId: string;
  evaluatorId: string;
  rubricId: string;
  scores: EvaluationScore[];
  totalScore: number;       // 0-100, calculated
  notes: string;
  recommendation: RecommendationType;
  isDraft: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// INTERVIEW
// ============================================================
export interface InterviewScore {
  criterionName: string;
  score: number;
  weight: number;
}

export interface Interview {
  id: string;
  applicationId: string;
  interviewer: string;
  interviewDate?: number;
  location?: string;
  scores: InterviewScore[];
  totalScore: number;
  strengths?: string;
  concerns?: string;
  notes?: string;
  recommendation?: RecommendationType;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// FINAL DECISION
// ============================================================
export interface FinalDecision {
  id: string;
  applicationId: string;
  applicationScore: number;
  interviewScore?: number;
  finalScore: number;
  isComplete: boolean;    // false if interview pending
  finalDecision: FinalDecisionType;
  finalNotes?: string;
  decidedBy: string;
  decidedAt: number;
}

// ============================================================
// POSITION
// ============================================================
export interface Position {
  id: string;
  name: string;
  nameNormalized: string;
  track: Track;
  club?: string;
  rubricId?: string;   // custom rubric, else default
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// SELECTION CYCLE
// ============================================================
export interface SelectionCycle {
  id: string;
  name: string;
  academicYear: string;
  active: boolean;
  applicationWeight: number; // e.g. 70
  interviewWeight: number;   // e.g. 30
  blindEvaluation: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// NOTE
// ============================================================
export type NoteLevel = 'candidate' | 'application' | 'evaluation' | 'interview' | 'decision';

export interface Note {
  id: string;
  level: NoteLevel;
  refId: string;       // candidateId or applicationId etc.
  authorId: string;
  isPrivate: boolean;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// AUDIT LOG
// ============================================================
export interface AuditEntry {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  action: AuditAction;
  candidateId?: string;
  candidateName?: string;
  applicationId?: string;
  position?: string;
  details?: string;
}

// ============================================================
// DATA QUALITY ISSUE
// ============================================================
export interface DataQualityIssue {
  id: string;
  severity: DataQualitySeverity;
  type: string;
  description: string;
  sourceRow?: number;
  candidateId?: string;
  applicationId?: string;
  field?: string;
  value?: string;
  detectedAt: number;
}

// ============================================================
// COMPUTED / VIEW TYPES
// ============================================================
export interface CandidateWithApplications extends Candidate {
  applications: Application[];
  primaryApplication?: Application;
  evaluationCount: number;
  avgScore?: number;
  finalDecision?: FinalDecision;
}

export interface ApplicationWithCandidate extends Application {
  candidate: Candidate;
  evaluations: Evaluation[];
  interview?: Interview;
  finalDecision?: FinalDecision;
  avgScore?: number;
  evaluatorCount: number;
  hasDisagreement: boolean;
}

export interface RankedApplication {
  rank: number;
  application: ApplicationWithCandidate;
  applicationScore: number;
  interviewScore?: number;
  finalScore?: number;
  isComplete: boolean;
}
