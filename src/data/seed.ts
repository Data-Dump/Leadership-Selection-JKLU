// ============================================================
// Seed Database — loads CSV and creates default data
// ============================================================

import { db } from './db';
import { parseCSVText } from './csvParser';
import { v4 as uuidv4 } from 'uuid';
import { comparePositions } from '../utils/positionHierarchy';
import type {
  Evaluator,
  Rubric,
  Position,
  SelectionCycle,
  AuditEntry,
} from '../types';

const CSV_SEED_KEY = 'jklu_csv_seeded_v1';

// Default rubric criteria
const DEFAULT_RUBRIC_CRITERIA = [
  {
    id: uuidv4(),
    name: 'Relevant Past Experience',
    description: 'Relevance of previous experience, demonstrated responsibility, actual involvement rather than simply listing activities.',
    weight: 25,
    maxScore: 10,
  },
  {
    id: uuidv4(),
    name: 'Leadership',
    description: 'Ownership, responsibility, ability to coordinate others, evidence of leadership.',
    weight: 20,
    maxScore: 10,
  },
  {
    id: uuidv4(),
    name: 'Vision / Reasoning',
    description: 'Quality of "Why should we choose you?", understanding of the position, clarity of thought, practical ideas.',
    weight: 20,
    maxScore: 10,
  },
  {
    id: uuidv4(),
    name: 'Communication',
    description: 'Clarity, structure, ability to communicate ideas.',
    weight: 15,
    maxScore: 10,
  },
  {
    id: uuidv4(),
    name: 'Role Fit',
    description: 'Suitability for the specific position, relevant skills, understanding of responsibilities.',
    weight: 10,
    maxScore: 10,
  },
  {
    id: uuidv4(),
    name: 'Demonstrated Contribution',
    description: 'Evidence of actual impact, achievements, measurable contribution where available.',
    weight: 10,
    maxScore: 10,
  },
];

const DEMO_EVALUATORS: Evaluator[] = [

  {
    id: 'eval-kaushal-superadmin',
    name: 'Kaushal Malvi',
    email: 'kaushalmalvi@jklu.edu.in',
    role: 'Super Admin',
    active: true,
    passwordHash: 'admin123',
    createdAt: Date.now(),
  },
  {
    id: 'eval-admin-anushka',
    name: 'Anushka Pathak',
    email: 'anushka.pathak@jklu.edu.in',
    role: 'Admin',
    active: true,
    passwordHash: 'admin123',
    createdAt: Date.now(),
  },
  {
    id: 'eval-admin-rattan',
    name: 'Rattan Gangadhar',
    email: 'rattan.gangadhar@jklu.edu.in',
    role: 'Admin',
    active: true,
    passwordHash: 'admin123',
    createdAt: Date.now(),
  },
  {
    id: 'eval-admin-richa',
    name: 'Richa Sharma',
    email: 'richasharma@jklu.edu.in',
    role: 'Admin',
    active: true,
    passwordHash: 'admin123',
    createdAt: Date.now(),
  },
  {
    id: 'eval-admin-vaibhav',
    name: 'Vaibhav Topiwala',
    email: 'vaibhav.topiwala@jklu.edu.in',
    role: 'Admin',
    active: true,
    passwordHash: 'admin123',
    createdAt: Date.now(),
  },
  {
    id: 'eval-viewer-panel',
    name: 'Panel Access',
    email: 'panel.access@kaushal.sbs',
    role: 'Viewer',
    active: true,
    passwordHash: 'admin123',
    createdAt: Date.now(),
  },
];

export async function seedDatabase(csvText?: string): Promise<{ seeded: boolean; stats?: object }> {
  // Check if already seeded
  const existingCandidates = await db.candidates.count();
  if (existingCandidates > 0) {
    return { seeded: false };
  }

  const now = Date.now();

  // 1. Seed evaluators
  await db.evaluators.bulkAdd(DEMO_EVALUATORS);

  // 2. Seed default rubric
  const defaultRubricId = 'rubric-default-1';
  const defaultRubric: Rubric = {
    id: defaultRubricId,
    name: 'Default Evaluation Rubric',
    criteria: DEFAULT_RUBRIC_CRITERIA,
    createdAt: now,
    updatedAt: now,
  };
  await db.rubrics.add(defaultRubric);

  // 3. Seed selection cycle
  const cycle: SelectionCycle = {
    id: 'cycle-2026-27',
    name: 'JKLU Student Leadership Selection',
    academicYear: '2026–27',
    active: true,
    applicationWeight: 70,
    interviewWeight: 30,
    blindEvaluation: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.selectionCycles.add(cycle);

  // 4. Parse and import CSV
  if (!csvText) {
    return { seeded: true, stats: { message: 'No CSV provided' } };
  }

  const parseResult = parseCSVText(csvText);

  // Bulk insert candidates and applications
  await db.candidates.bulkAdd(parseResult.candidates);
  await db.applications.bulkAdd(parseResult.applications);
  await db.dataQualityIssues.bulkAdd(parseResult.dataQualityIssues);

  // 5. Auto-create positions from the applications
  const positionMap = new Map<string, { name: string; track: string; club?: string }>();
  for (const app of parseResult.applications) {
    const key = `${app.track}::${app.positionNormalized}${app.club ? `::${app.club.toLowerCase()}` : ''}`;
    if (!positionMap.has(key)) {
      positionMap.set(key, { name: app.position, track: app.track, club: app.club });
    }
  }

  const positions: Position[] = [];
  for (const [, val] of positionMap) {
    positions.push({
      id: uuidv4(),
      name: val.name,
      nameNormalized: val.name.toLowerCase().replace(/[\s\-–—]+/g, ' '),
      track: val.track as Position['track'],
      club: val.club,
      rubricId: defaultRubricId,
      createdAt: now,
      updatedAt: now,
    });
  }
  positions.sort((a, b) => comparePositions(
    { name: a.name, club: a.club, track: a.track },
    { name: b.name, club: b.club, track: b.track }
  ));
  await db.positions.bulkAdd(positions);

  // 6. Audit entry for import
  const auditEntry: AuditEntry = {
    id: uuidv4(),
    timestamp: now,
    userId: 'system',
    userName: 'System',
    action: 'imported',
    details: `Imported ${parseResult.stats.candidatesCreated} candidates and ${parseResult.stats.applicationsCreated} applications from CSV. ${parseResult.stats.issuesFound} data quality issues detected.`,
  };
  await db.auditLog.add(auditEntry);

  return { seeded: true, stats: parseResult.stats };
}

export { DEFAULT_RUBRIC_CRITERIA, DEMO_EVALUATORS };
