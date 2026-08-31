-- ============================================================
-- JKLU Student Leadership Selection System
-- Complete PostgreSQL Schema for Supabase
-- ============================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Candidates table
CREATE TABLE IF NOT EXISTS candidates (
  "id" TEXT PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  "rollNumber" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "batch" TEXT,
  "programme" TEXT,
  "nameNormalized" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidates_roll ON candidates ("rollNumber");
CREATE INDEX IF NOT EXISTS idx_candidates_batch ON candidates ("batch");

-- 2. Applications table
CREATE TABLE IF NOT EXISTS applications (
  "id" TEXT PRIMARY KEY,
  "candidateId" TEXT NOT NULL REFERENCES candidates("id") ON DELETE CASCADE,
  "track" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "positionNormalized" TEXT NOT NULL,
  "club" TEXT,
  "preferenceOrder" INT NOT NULL DEFAULT 1,
  "areaOfInterest" TEXT,
  "pastExperience" TEXT,
  "whyChooseYou" TEXT,
  "nextPreference" TEXT,
  "sourceRow" INT NOT NULL,
  "sourceSection" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Pending Review',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications ("candidateId");
CREATE INDEX IF NOT EXISTS idx_applications_track ON applications ("track");
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications ("status");
CREATE INDEX IF NOT EXISTS idx_applications_position ON applications ("positionNormalized");

-- 3. Evaluators table
CREATE TABLE IF NOT EXISTS evaluators (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "role" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "passwordHash" TEXT,
  "createdAt" BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evaluators_email ON evaluators ("email");

-- 4. Rubrics table
CREATE TABLE IF NOT EXISTS rubrics (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "positionId" TEXT,
  "criteria" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

-- 5. Positions table
CREATE TABLE IF NOT EXISTS positions (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "nameNormalized" TEXT NOT NULL,
  "track" TEXT NOT NULL,
  "club" TEXT,
  "rubricId" TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_positions_track ON positions ("track");
CREATE INDEX IF NOT EXISTS idx_positions_name ON positions ("nameNormalized");

-- 6. Evaluations table
CREATE TABLE IF NOT EXISTS evaluations (
  "id" TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL REFERENCES applications("id") ON DELETE CASCADE,
  "evaluatorId" TEXT NOT NULL REFERENCES evaluators("id") ON DELETE CASCADE,
  "rubricId" TEXT NOT NULL,
  "scores" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL DEFAULT '',
  "recommendation" TEXT NOT NULL,
  "isDraft" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL,
  CONSTRAINT uq_eval_app_evaluator UNIQUE ("applicationId", "evaluatorId")
);

CREATE INDEX IF NOT EXISTS idx_evaluations_app ON evaluations ("applicationId");
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator ON evaluations ("evaluatorId");

-- 7. Interviews table
CREATE TABLE IF NOT EXISTS interviews (
  "id" TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL REFERENCES applications("id") ON DELETE CASCADE,
  "interviewer" TEXT NOT NULL,
  "interviewDate" BIGINT,
  "location" TEXT,
  "scores" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "strengths" TEXT,
  "concerns" TEXT,
  "notes" TEXT,
  "recommendation" TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interviews_app ON interviews ("applicationId");

-- 8. Final Decisions table
CREATE TABLE IF NOT EXISTS final_decisions (
  "id" TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL REFERENCES applications("id") ON DELETE CASCADE UNIQUE,
  "applicationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "interviewScore" DOUBLE PRECISION,
  "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isComplete" BOOLEAN NOT NULL DEFAULT false,
  "finalDecision" TEXT NOT NULL,
  "finalNotes" TEXT,
  "decidedBy" TEXT NOT NULL,
  "decidedAt" BIGINT NOT NULL
);

-- 9. Selection Cycles table
CREATE TABLE IF NOT EXISTS selection_cycles (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "applicationWeight" INT NOT NULL DEFAULT 70,
  "interviewWeight" INT NOT NULL DEFAULT 30,
  "blindEvaluation" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

-- 10. Notes table
CREATE TABLE IF NOT EXISTS notes (
  "id" TEXT PRIMARY KEY,
  "level" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  "content" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_ref ON notes ("refId");

-- 11. Audit Log table
CREATE TABLE IF NOT EXISTS audit_log (
  "id" TEXT PRIMARY KEY,
  "timestamp" BIGINT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "candidateId" TEXT,
  "candidateName" TEXT,
  "applicationId" TEXT,
  "position" TEXT,
  "details" TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log ("timestamp" DESC);

-- 12. Data Quality Issues table
CREATE TABLE IF NOT EXISTS data_quality_issues (
  "id" TEXT PRIMARY KEY,
  "severity" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sourceRow" INT,
  "candidateId" TEXT,
  "applicationId" TEXT,
  "field" TEXT,
  "value" TEXT,
  "detectedAt" BIGINT NOT NULL
);

-- Enable RLS and Grant open access for team collaboration
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluators ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_quality_issues ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated and anon requests with the public key to collaborate
CREATE POLICY "Allow public full access to candidates" ON candidates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to applications" ON applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to evaluators" ON evaluators FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to rubrics" ON rubrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to positions" ON positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to evaluations" ON evaluations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to interviews" ON interviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to final_decisions" ON final_decisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to selection_cycles" ON selection_cycles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to notes" ON notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to audit_log" ON audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access to data_quality_issues" ON data_quality_issues FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE evaluations;
ALTER PUBLICATION supabase_realtime ADD TABLE applications;
ALTER PUBLICATION supabase_realtime ADD TABLE interviews;
ALTER PUBLICATION supabase_realtime ADD TABLE final_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_log;
