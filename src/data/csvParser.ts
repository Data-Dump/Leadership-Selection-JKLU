// ============================================================
// CSV Parser — JKLU Leadership Selection
// Handles the de-normalized 3-section CSV structure
// Each CSV row can produce up to 3 Application records
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  Candidate,
  Application,
  ApplicationStatus,
  Track,
  DataQualityIssue,
  DataQualitySeverity,
} from '../types';

interface ParsedRow {
  id: string;
  startTime: string;
  completionTime: string;
  email: string;
  name: string;
  fullName: string;
  rollNumber: string;
  contactNumber: string;
  primaryPosition: string;
  // Section A – Student Council
  scPosition: string;
  areaOfInterest: string;
  pastExperienceA: string;
  whyChooseYouA: string;
  nextPrefA: string;
  // Section B – Club Leadership
  clubPosition: string;
  club: string;
  pastExperienceB: string;
  whyChooseYouB: string;
  nextPrefB: string;
  // Section C – Coordinator
  desiredPost: string;
  pastExperienceC: string;
  whyChooseYouC: string;
}

export interface ParseResult {
  candidates: Candidate[];
  applications: Application[];
  dataQualityIssues: DataQualityIssue[];
  stats: {
    totalRows: number;
    candidatesCreated: number;
    applicationsCreated: number;
    issuesFound: number;
  };
}

function toTitleCase(str: string): string {
  if (!str) return '';
  // Don't auto-change — just trim. Flag separately.
  return str.trim();
}

function normalizeName(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePosition(str: string): string {
  return str.trim().toLowerCase().replace(/[\s\-–—]+/g, ' ');
}

/**
 * Provisional roll numbers: exactly 4 digits, no year prefix.
 * These are 2026-batch students who have not yet received their
 * full roll number. Normalize them to "2026/XXXX" format.
 */
function normalizeRollNumber(raw: string): string {
  if (/^\d{4}$/.test(raw.trim())) {
    return `2026/${raw.trim()}`;
  }
  return raw.trim();
}

function isProvisionalRollNumber(raw: string): boolean {
  return /^\d{4}$/.test(raw.trim());
}

function extractBatch(rollNumber: string): string | undefined {
  // Handle normalized provisional format: 2026/XXXX
  const slashMatch = rollNumber.match(/^(20\d\d)\//i);
  if (slashMatch) return slashMatch[1];
  // Standard format: 20XXABC...
  const m = rollNumber.match(/^(20\d\d)/i);
  if (!m) return undefined;
  return m[1];
}

function extractProgramme(rollNumber: string): string | undefined {
  // Provisional numbers (2026/XXXX) have no programme code
  if (/^20\d\d\//.test(rollNumber)) return undefined;
  const m = rollNumber.match(/^20\d\d([a-zA-Z]+)/i);
  if (!m) return undefined;
  const code = m[1].toUpperCase();
  const map: Record<string, string> = {
    BTECH: 'B.Tech',
    BBA: 'BBA',
    MBA: 'MBA',
    MTECH: 'M.Tech',
    PHD: 'Ph.D',
    BSC: 'B.Sc',
    MSC: 'M.Sc',
  };
  return map[code] || code;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidRollNumber(roll: string): boolean {
  // Normalized provisional: 2026/XXXX
  if (/^2026\/\d{4}$/.test(roll)) return true;
  // Standard: must start with 20XX and be at least 8 chars
  return /^20\d\d[a-zA-Z0-9]{4,}/i.test(roll);
}

function isSuspiciousBatch(rollNumber: string): boolean {
  // Provisional numbers are always 2026 — never suspicious
  if (/^2026\/\d{4}$/.test(rollNumber)) return false;
  const m = rollNumber.match(/^(20\d\d)/i);
  if (!m) return false;
  const year = parseInt(m[1]);
  return year < 2022 || year > 2027;
}

function makeIssue(
  severity: DataQualitySeverity,
  type: string,
  description: string,
  extra: Partial<DataQualityIssue> = {}
): DataQualityIssue {
  return {
    id: uuidv4(),
    severity,
    type,
    description,
    detectedAt: Date.now(),
    ...extra,
  };
}

export function parseCSVText(csvText: string): ParseResult {
  const lines = csvText.split('\n');
  if (lines.length < 2) {
    return {
      candidates: [],
      applications: [],
      dataQualityIssues: [],
      stats: { totalRows: 0, candidatesCreated: 0, applicationsCreated: 0, issuesFound: 0 },
    };
  }

  // Parse CSV with proper quote handling
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  const headers = parseLine(lines[0]).map(h => h.trim().replace(/\r$/, ''));

  const colIdx = {
    id: headers.indexOf('Id'),
    startTime: headers.indexOf('Start time'),
    completionTime: headers.indexOf('Completion time'),
    email: headers.indexOf('Email'),
    name: headers.indexOf('Name'),
    fullName: headers.indexOf('Full name'),
    rollNumber: headers.indexOf('Roll Number'),
    contactNumber: headers.indexOf('Contact Number'),
    primaryPosition: headers.indexOf('What position are you applying for?'),
    scPosition: headers.indexOf('Which Student Council position are you applying for?'),
    areaOfInterest: headers.indexOf('Area of Interest (If selecting President, fill this too as per your interest.)'),
    pastExperienceA: headers.indexOf('Past Experience'),
    whyChooseYouA: headers.indexOf('Why Should We Choose You?'),
    nextPrefA: headers.indexOf('If not selected for your preferred position, what would be your next preference?'),
    clubPosition: headers.indexOf('Which Club Leadership position are you applying for?'),
    club: headers.indexOf('Which Club?'),
    pastExperienceB: headers.indexOf('Past Experience1'),
    whyChooseYouB: headers.indexOf('Why Should We Choose You?1'),
    nextPrefB: headers.indexOf('If not selected for your preferred position, what would be your next preference?1'),
    desiredPost: headers.indexOf('Desired Post'),
    pastExperienceC: headers.indexOf('Past Experience2'),
    whyChooseYouC: headers.indexOf('Why Should We Choose You?2'),
  };

  const candidates: Candidate[] = [];
  const applications: Application[] = [];
  const dataQualityIssues: DataQualityIssue[] = [];
  const seenRollNumbers = new Map<string, string>(); // rollNumber -> candidateId

  const dataRows = lines
    .slice(1)
    .filter(l => l.trim())
    .map(l => l.replace(/\r$/, ''));

  const now = Date.now();

  for (const rawLine of dataRows) {
    const cols = parseLine(rawLine);
    const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx]?.trim() || '' : '');

    const sourceRowId = parseInt(get(colIdx.id)) || 0;
    const rawName = get(colIdx.fullName) || get(colIdx.name);
    const rawRoll = get(colIdx.rollNumber);
    const rawEmail = get(colIdx.email);
    const rawPhone = get(colIdx.contactNumber);
    const primaryPos = get(colIdx.primaryPosition);

    // Normalize provisional roll numbers (4-digit → 2026/XXXX) before any checks
    const normalizedRoll = rawRoll ? normalizeRollNumber(rawRoll) : '';
    const isProvisional = rawRoll ? isProvisionalRollNumber(rawRoll) : false;

    // ---- Data quality checks ----
    if (!rawName) {
      dataQualityIssues.push(makeIssue('Critical', 'missing_name',
        `Row ${sourceRowId}: Missing candidate name.`, { sourceRow: sourceRowId }));
    }
    if (rawEmail && !isValidEmail(rawEmail)) {
      dataQualityIssues.push(makeIssue('Warning', 'invalid_email',
        `Row ${sourceRowId}: Email "${rawEmail}" (${rawName}) appears malformed.`,
        { sourceRow: sourceRowId, field: 'email', value: rawEmail }));
    }

    // ---- Create or find candidate ----
    // Use the normalized roll number as the dedup key and stored value
    const rollKey = normalizedRoll.toLowerCase();
    let candidateId: string;

    if (seenRollNumbers.has(rollKey)) {
      // Reuse existing candidate for multiple track applications
      candidateId = seenRollNumbers.get(rollKey)!;
    } else {
      candidateId = uuidv4();
      seenRollNumbers.set(rollKey, candidateId);

      const batch = extractBatch(normalizedRoll);
      const programme = extractProgramme(normalizedRoll);

      const candidate: Candidate = {
        id: candidateId,
        fullName: toTitleCase(rawName),
        rollNumber: normalizedRoll,  // store normalized form (2026/XXXX or original)
        email: rawEmail,
        phone: rawPhone || undefined,
        batch,
        programme,
        nameNormalized: normalizeName(rawName),
        createdAt: now,
        updatedAt: now,
      };
      candidates.push(candidate);
    }

    // ---- Section A: Student Council ----
    const scPos = get(colIdx.scPosition);
    if (scPos) {
      const app: Application = {
        id: uuidv4(),
        candidateId,
        track: 'Student Council',
        position: scPos,
        positionNormalized: normalizePosition(scPos),
        areaOfInterest: get(colIdx.areaOfInterest) || undefined,
        pastExperience: get(colIdx.pastExperienceA) || undefined,
        whyChooseYou: get(colIdx.whyChooseYouA) || undefined,
        nextPreference: get(colIdx.nextPrefA) || undefined,
        preferenceOrder: primaryPos.includes('Main Student Body') ? 1 : 2,
        sourceRow: sourceRowId,
        sourceSection: 'A',
        status: 'Pending Review',
        createdAt: now,
        updatedAt: now,
      };

      if (!app.pastExperience) {
        dataQualityIssues.push(makeIssue('Warning', 'missing_experience',
          `Row ${sourceRowId}: "${rawName}" has no past experience for Student Council application (${scPos}).`,
          { sourceRow: sourceRowId, candidateId, applicationId: app.id }));
      }
      if (!app.whyChooseYou) {
        dataQualityIssues.push(makeIssue('Warning', 'missing_why',
          `Row ${sourceRowId}: "${rawName}" has no "Why Should We Choose You?" for Student Council (${scPos}).`,
          { sourceRow: sourceRowId, candidateId, applicationId: app.id }));
      }
      applications.push(app);
    }

    // ---- Section B: Club Leadership ----
    const clubPos = get(colIdx.clubPosition);
    if (clubPos) {
      const club = get(colIdx.club);
      const app: Application = {
        id: uuidv4(),
        candidateId,
        track: 'Club Leadership',
        position: clubPos,
        positionNormalized: normalizePosition(clubPos),
        club: club || undefined,
        pastExperience: get(colIdx.pastExperienceB) || undefined,
        whyChooseYou: get(colIdx.whyChooseYouB) || undefined,
        nextPreference: get(colIdx.nextPrefB) || undefined,
        preferenceOrder: primaryPos.includes('Club Chair') ? 1 : 2,
        sourceRow: sourceRowId,
        sourceSection: 'B',
        status: 'Pending Review',
        createdAt: now,
        updatedAt: now,
      };
      applications.push(app);
    }

    // ---- Section C: Coordinator ----
    const desiredPost = get(colIdx.desiredPost);
    if (desiredPost) {
      const app: Application = {
        id: uuidv4(),
        candidateId,
        track: 'Coordinator',
        position: desiredPost,
        positionNormalized: normalizePosition(desiredPost),
        pastExperience: get(colIdx.pastExperienceC) || undefined,
        whyChooseYou: get(colIdx.whyChooseYouC) || undefined,
        preferenceOrder: primaryPos.includes('Coordinators') ? 1 : 2,
        sourceRow: sourceRowId,
        sourceSection: 'C',
        status: 'Pending Review',
        createdAt: now,
        updatedAt: now,
      };
      applications.push(app);
    }

    // Flag if no application section was found
    if (!scPos && !clubPos && !desiredPost) {
      dataQualityIssues.push(makeIssue('Critical', 'no_application',
        `Row ${sourceRowId}: "${rawName}" has no application section data (no SC, Club, or Coordinator preference found).`,
        { sourceRow: sourceRowId, candidateId }));
    }
  }

  return {
    candidates,
    applications,
    dataQualityIssues,
    stats: {
      totalRows: dataRows.length,
      candidatesCreated: candidates.length,
      applicationsCreated: applications.length,
      issuesFound: dataQualityIssues.length,
    },
  };
}
