-- ============================================================
-- JKLU Student Leadership Selection System
-- Initial Seed Data (Super Admin, Admins, Viewer, Rubric, Cycle)
-- ============================================================

-- 1. Evaluators (Committee Accounts)
INSERT INTO evaluators ("id", "name", "email", "role", "active", "passwordHash", "createdAt")
VALUES
  ('eval-kaushal-superadmin', 'Kaushal Malvi', 'kaushalmalvi@jklu.edu.in', 'Super Admin', true, 'admin123', 1725114000000),
  ('eval-admin-anushka', 'Anushka Pathak', 'anushka.pathak@jklu.edu.in', 'Admin', true, 'admin123', 1725114000000),
  ('eval-admin-rattan', 'Rattan Gangadhar', 'rattan.gangadhar@jklu.edu.in', 'Admin', true, 'admin123', 1725114000000),
  ('eval-admin-richa', 'Richa Sharma', 'richasharma@jklu.edu.in', 'Admin', true, 'admin123', 1725114000000),
  ('eval-admin-vaibhav', 'Vaibhav Topiwala', 'vaibhav.topiwala@jklu.edu.in', 'Admin', true, 'admin123', 1725114000000),
  ('eval-viewer-panel', 'Panel Access', 'panel.access@kaushal.sbs', 'Viewer', true, 'admin123', 1725114000000)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "email" = EXCLUDED."email",
  "role" = EXCLUDED."role",
  "active" = EXCLUDED."active";

-- 2. Default Rubric
INSERT INTO rubrics ("id", "name", "positionId", "criteria", "createdAt", "updatedAt")
VALUES (
  'rubric-default-1',
  'Default Evaluation Rubric',
  NULL,
  '[
    {"id": "crit-1", "name": "Relevant Past Experience", "description": "Relevance of previous experience, demonstrated responsibility, actual involvement rather than simply listing activities.", "weight": 25, "maxScore": 10},
    {"id": "crit-2", "name": "Leadership", "description": "Ownership, responsibility, ability to coordinate others, evidence of leadership.", "weight": 20, "maxScore": 10},
    {"id": "crit-3", "name": "Vision / Reasoning", "description": "Quality of \"Why should we choose you?\", understanding of the position, clarity of thought, practical ideas.", "weight": 20, "maxScore": 10},
    {"id": "crit-4", "name": "Communication", "description": "Clarity, structure, ability to communicate ideas.", "weight": 15, "maxScore": 10},
    {"id": "crit-5", "name": "Role Fit", "description": "Suitability for the specific position, relevant skills, understanding of responsibilities.", "weight": 10, "maxScore": 10},
    {"id": "crit-6", "name": "Demonstrated Contribution", "description": "Evidence of actual impact, achievements, measurable contribution where available.", "weight": 10, "maxScore": 10}
  ]'::jsonb,
  1725114000000,
  1725114000000
)
ON CONFLICT ("id") DO NOTHING;

-- 3. Selection Cycle
INSERT INTO selection_cycles ("id", "name", "academicYear", "active", "applicationWeight", "interviewWeight", "blindEvaluation", "createdAt", "updatedAt")
VALUES (
  'cycle-2026-27',
  'JKLU Student Leadership Selection',
  '2026–27',
  true,
  70,
  30,
  false,
  1725114000000,
  1725114000000
)
ON CONFLICT ("id") DO NOTHING;
