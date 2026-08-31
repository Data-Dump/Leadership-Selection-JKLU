// ============================================================
// Normalization & Ingestion Script
// Reads from Supabase application_import / applications_import
// Populates normalized tables: candidates, applications, positions, data_quality_issues
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://dblnbfbkqvcvhlaskbpb.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibG5iZmJrcXZjdmhsYXNrYnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODA3NzMsImV4cCI6MjEwMzc1Njc3M30.6tuRxUFZBy9uE4SEIWshht9hlKQxybaUUkqECYJpTIA';

const supabase = createClient(supabaseUrl, supabaseKey);

// Column resolution helper - finds matching key regardless of case, spaces, underscores, punctuation
function findColumn(row, candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const cleanC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const k of keys) {
      const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanK === cleanC) {
        return row[k];
      }
    }
  }
  // Try substring / fuzzy contains
  for (const c of candidates) {
    const cleanC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const k of keys) {
      const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanK.includes(cleanC) || cleanC.includes(cleanK)) {
        return row[k];
      }
    }
  }
  return '';
}

function normalizeRollNumber(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^\d{4}$/.test(trimmed)) {
    return `2026/${trimmed}`;
  }
  return trimmed;
}

function isProvisionalRollNumber(raw) {
  if (!raw) return false;
  return /^\d{4}$/.test(String(raw).trim());
}

function extractBatch(rollNumber) {
  if (!rollNumber) return undefined;
  const slashMatch = rollNumber.match(/^(20\d\d)\//i);
  if (slashMatch) return slashMatch[1];
  const m = rollNumber.match(/^(20\d\d)/i);
  if (!m) return undefined;
  return m[1];
}

function extractProgramme(rollNumber) {
  if (!rollNumber || /^20\d\d\//.test(rollNumber)) return undefined;
  const m = rollNumber.match(/^20\d\d([a-zA-Z]+)/i);
  if (!m) return undefined;
  const code = m[1].toUpperCase();
  const map = {
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

function normalizeName(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePosition(str) {
  return String(str || '').trim().toLowerCase().replace(/[\s\-–—]+/g, ' ');
}

function isValidRollNumber(roll) {
  if (/^2026\/\d{4}$/.test(roll)) return true;
  return /^20\d\d[a-zA-Z0-9]{4,}/i.test(roll);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isSuspiciousBatch(rollNumber) {
  if (/^2026\/\d{4}$/.test(rollNumber)) return false;
  const m = rollNumber.match(/^(20\d\d)/i);
  if (!m) return false;
  const year = parseInt(m[1]);
  return year < 2022 || year > 2027;
}

function makeIssue(severity, type, description, extra = {}) {
  return {
    id: uuidv4(),
    severity,
    type,
    description,
    detectedAt: Date.now(),
    ...extra,
  };
}

async function runNormalization(rawRows) {
  const now = Date.now();

  const candidatesMap = new Map(); // rollKey -> Candidate
  const applications = [];
  const dataQualityIssues = [];
  const positionsMap = new Map(); // posKey -> Position

  const duplicateRolls = [];
  const missingData = [];
  const ambiguousRows = [];

  let sourceRowIdx = 0;

  for (const rawRow of rawRows) {
    sourceRowIdx++;

    const rawId = findColumn(rawRow, ['Id', 'id']) || String(sourceRowIdx);
    const sourceRowId = parseInt(rawId) || sourceRowIdx;

    const rawFullName = findColumn(rawRow, ['Full name', 'FullName', 'full_name']);
    const rawName = findColumn(rawRow, ['Name', 'name']);
    const candidateName = String(rawFullName || rawName || '').trim();

    const rawRoll = String(findColumn(rawRow, ['Roll Number', 'RollNumber', 'roll_number', 'rollno', 'roll']) || '').trim();
    const rawEmail = String(findColumn(rawRow, ['Email', 'email', 'email_address']) || '').trim();
    const rawPhone = String(findColumn(rawRow, ['Contact Number', 'ContactNumber', 'contact_number', 'phone']) || '').trim();
    const primaryPos = String(findColumn(rawRow, ['What position are you applying for?', 'position_applying_for', 'primary_position']) || '').trim();

    // Section A - Student Council
    const scPosition = String(findColumn(rawRow, ['Which Student Council position are you applying for?', 'student_council_position', 'sc_position']) || '').trim();
    const areaOfInterest = String(findColumn(rawRow, ['Area of Interest (If selecting President, fill this too as per your interest.)', 'Area of Interest', 'area_of_interest']) || '').trim();
    const pastExperienceA = String(findColumn(rawRow, ['Past Experience', 'past_experience', 'past_experience_a']) || '').trim();
    const whyChooseYouA = String(findColumn(rawRow, ['Why Should We Choose You?', 'why_choose_you', 'why_should_we_choose_you_a']) || '').trim();
    const nextPrefA = String(findColumn(rawRow, ['If not selected for your preferred position, what would be your next preference?', 'next_preference_a', 'next_pref_a']) || '').trim();

    // Section B - Club Leadership
    const clubPosition = String(findColumn(rawRow, ['Which Club Leadership position are you applying for?', 'club_position', 'club_leadership_position']) || '').trim();
    const club = String(findColumn(rawRow, ['Which Club?', 'club', 'which_club']) || '').trim();
    const pastExperienceB = String(findColumn(rawRow, ['Past Experience1', 'past_experience1', 'past_experience_b']) || '').trim();
    const whyChooseYouB = String(findColumn(rawRow, ['Why Should We Choose You?1', 'why_choose_you1', 'why_should_we_choose_you_b']) || '').trim();
    const nextPrefB = String(findColumn(rawRow, ['If not selected for your preferred position, what would be your next preference?1', 'next_preference_b', 'next_pref_b']) || '').trim();

    // Section C - Coordinator
    const desiredPost = String(findColumn(rawRow, ['Desired Post', 'desired_post', 'coordinator_position']) || '').trim();
    const pastExperienceC = String(findColumn(rawRow, ['Past Experience2', 'past_experience2', 'past_experience_c']) || '').trim();
    const whyChooseYouC = String(findColumn(rawRow, ['Why Should We Choose You?2', 'why_choose_you2', 'why_should_we_choose_you_c']) || '').trim();

    const normalizedRoll = normalizeRollNumber(rawRoll);
    const isProvisional = isProvisionalRollNumber(rawRoll);

    // ---- Data Quality Checks ----
    if (!candidateName) {
      missingData.push({ row: sourceRowId, field: 'name', issue: 'Missing name' });
      dataQualityIssues.push(makeIssue('Critical', 'missing_name',
        `Row ${sourceRowId}: Missing candidate name.`, { sourceRow: sourceRowId }));
    }

    if (rawEmail && !isValidEmail(rawEmail)) {
      dataQualityIssues.push(makeIssue('Warning', 'invalid_email',
        `Row ${sourceRowId}: Email "${rawEmail}" (${candidateName}) appears malformed.`,
        { sourceRow: sourceRowId, field: 'email', value: rawEmail }));
    }

    // Determine unique candidate ID using normalized roll number or fallback to email/row
    const rollKey = (normalizedRoll || rawEmail || `candidate-row-${sourceRowId}`).toLowerCase();
    let candidateId;

    if (candidatesMap.has(rollKey)) {
      candidateId = candidatesMap.get(rollKey).id;
    } else {
      candidateId = `cand-${normalizedRoll.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
      const batch = extractBatch(normalizedRoll);
      const programme = extractProgramme(normalizedRoll);

      candidatesMap.set(rollKey, {
        id: candidateId,
        fullName: candidateName,
        rollNumber: normalizedRoll || 'UNKNOWN',
        email: rawEmail,
        phone: rawPhone || undefined,
        batch,
        programme,
        nameNormalized: normalizeName(candidateName),
        createdAt: now,
        updatedAt: now,
      });
    }

    // ---- Track Applications Extraction ----
    let rowAppCount = 0;

    // Track 1: Student Council (Section A)
    if (scPosition) {
      rowAppCount++;
      const posNorm = normalizePosition(scPosition);
      const isPrimary = primaryPos.toLowerCase().includes('student council') || primaryPos.toLowerCase().includes('main');

      applications.push({
        id: `app-${candidateId}-sc-${sourceRowId}`,
        candidateId,
        track: 'Student Council',
        position: scPosition,
        positionNormalized: posNorm,
        club: undefined,
        preferenceOrder: isPrimary ? 1 : 2,
        areaOfInterest: areaOfInterest || undefined,
        pastExperience: pastExperienceA || undefined,
        whyChooseYou: whyChooseYouA || undefined,
        nextPreference: nextPrefA || undefined,
        sourceRow: sourceRowId,
        sourceSection: 'A',
        status: 'Pending Review',
        createdAt: now,
        updatedAt: now,
      });

      if (!positionsMap.has(`sc::${posNorm}`)) {
        positionsMap.set(`sc::${posNorm}`, {
          id: `pos-sc-${posNorm.replace(/[^a-z0-9]/g, '-')}`,
          name: scPosition,
          nameNormalized: posNorm,
          track: 'Student Council',
          club: undefined,
          rubricId: 'rubric-default-1',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Track 2: Club Leadership (Section B)
    if (clubPosition || club) {
      rowAppCount++;
      const posDisplay = clubPosition || 'Club Leadership';
      const posNorm = normalizePosition(posDisplay);
      const isPrimary = primaryPos.toLowerCase().includes('club');

      applications.push({
        id: `app-${candidateId}-club-${sourceRowId}`,
        candidateId,
        track: 'Club Leadership',
        position: posDisplay,
        positionNormalized: posNorm,
        club: club || undefined,
        preferenceOrder: isPrimary ? 1 : (scPosition ? 2 : 1),
        areaOfInterest: undefined,
        pastExperience: pastExperienceB || undefined,
        whyChooseYou: whyChooseYouB || undefined,
        nextPreference: nextPrefB || undefined,
        sourceRow: sourceRowId,
        sourceSection: 'B',
        status: 'Pending Review',
        createdAt: now,
        updatedAt: now,
      });

      const posKey = `club::${posNorm}::${club ? club.toLowerCase() : ''}`;
      if (!positionsMap.has(posKey)) {
        positionsMap.set(posKey, {
          id: `pos-club-${posNorm.replace(/[^a-z0-9]/g, '-')}-${(club || 'gen').toLowerCase()}`,
          name: posDisplay,
          nameNormalized: posNorm,
          track: 'Club Leadership',
          club: club || undefined,
          rubricId: 'rubric-default-1',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Track 3: Coordinator (Section C)
    if (desiredPost) {
      rowAppCount++;
      const posNorm = normalizePosition(desiredPost);
      const isPrimary = primaryPos.toLowerCase().includes('coordinator');

      applications.push({
        id: `app-${candidateId}-coord-${sourceRowId}`,
        candidateId,
        track: 'Coordinator',
        position: desiredPost,
        positionNormalized: posNorm,
        club: undefined,
        preferenceOrder: isPrimary ? 1 : 3,
        areaOfInterest: undefined,
        pastExperience: pastExperienceC || undefined,
        whyChooseYou: whyChooseYouC || undefined,
        nextPreference: undefined,
        sourceRow: sourceRowId,
        sourceSection: 'C',
        status: 'Pending Review',
        createdAt: now,
        updatedAt: now,
      });

      if (!positionsMap.has(`coord::${posNorm}`)) {
        positionsMap.set(`coord::${posNorm}`, {
          id: `pos-coord-${posNorm.replace(/[^a-z0-9]/g, '-')}`,
          name: desiredPost,
          nameNormalized: posNorm,
          track: 'Coordinator',
          club: undefined,
          rubricId: 'rubric-default-1',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Check for Ambiguous Rows: primary position declared but no specific section filled
    if (rowAppCount === 0) {
      ambiguousRows.push({
        row: sourceRowId,
        candidate: candidateName,
        declaredPosition: primaryPos,
        reason: 'Selected track/position in primary question but did not fill specific section details.',
      });
      dataQualityIssues.push(makeIssue('Warning', 'ambiguous_application',
        `Row ${sourceRowId}: Candidate "${candidateName}" selected "${primaryPos}" but left section details empty.`,
        { sourceRow: sourceRowId, candidateId, field: 'What position are you applying for?', value: primaryPos }));
    }
  }

  const candidates = Array.from(candidatesMap.values());
  const positions = Array.from(positionsMap.values());

  return {
    candidates,
    applications,
    positions,
    dataQualityIssues,
    stats: {
      totalSourceRows: rawRows.length,
      uniqueCandidates: candidates.length,
      totalApplications: applications.length,
      duplicateRolls,
      missingData,
      ambiguousRows,
    },
  };
}

module.exports = {
  runNormalization,
  findColumn,
};
