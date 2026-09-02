const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      currentRow.push(currentVal);
      currentVal = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      currentRow.push(currentVal);
      rows.push(currentRow);
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += c;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }
  return rows;
}

function normalizeRollNumber(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^\d{1,4}$/.test(trimmed)) {
    return `2026/${trimmed.padStart(4, '0')}`;
  }
  return trimmed;
}

function extractBatch(rawRoll, appliedPos) {
  if (!rawRoll) return '';
  const str = String(rawRoll).trim();

  // Explicit year like 2024, 2025, 2026, 2023 anywhere in the roll number string (e.g. JKLU/B.TECH/2026/1458)
  const yearMatch = str.match(/\b(202[3-7])\b/);
  if (yearMatch) return yearMatch[1];

  // At start of roll like 2024btech...
  const startYear = str.match(/^(202[3-7])/);
  if (startYear) return startYear[1];

  // Typo like 2826BBA... -> 2026
  if (/^2826/i.test(str)) return '2026';

  // If provisional 1-4 digit roll number (e.g., 1458, 0803, 429) -> Batch 2026
  if (/^\d{1,4}$/.test(str)) return '2026';

  // Check from applied position if any (e.g. 'Secretary - Batch 2025' or 'Club Chair - Batch 2025' or 'Club Co-Chair - Batch 2026')
  if (appliedPos) {
    const posYear = appliedPos.match(/Batch\s*(202[3-7])/i);
    if (posYear) return posYear[1];
  }

  return '';
}

function extractProgramme(rawRoll) {
  if (!rawRoll) return '';
  const str = String(rawRoll).trim().toUpperCase();

  // B.Tech / BTECH (e.g. JKLU/B.TECH/2026/1458, 2024BTECH190, Btech/2026/0555)
  if (/B\.?\s*TECH/i.test(str) || /BTECH/i.test(str)) return 'B.Tech';

  // BBA
  if (/BBA/i.test(str)) return 'BBA';

  // B.Des / BDES (e.g. JKLU/2026/B.DES/029, B.des 016)
  if (/B\.?\s*DES/i.test(str) || /BDES/i.test(str)) return 'B.Des';

  // MBA / IM
  if (/MBA/i.test(str) || /^IM\d+/i.test(str)) return 'MBA';

  // M.Tech / MTECH
  if (/M\.?\s*TECH/i.test(str) || /MTECH/i.test(str)) return 'M.Tech';

  // BCA / MCA
  if (/BCA/i.test(str)) return 'BCA';
  if (/MCA/i.test(str)) return 'MCA';

  // PhD
  if (/PH\.?D/i.test(str)) return 'Ph.D';

  return '';
}

function formatName(name) {
  if (!name) return '';
  return name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCoordinatorRole(raw) {
  if (!raw) return 'Coordinator';
  const clean = raw.trim();
  if (/coordinator/i.test(clean)) return clean;
  if (/campus ambassador/i.test(clean)) return 'Campus Ambassador (Coordinator)';
  return `${clean} Coordinator`;
}

// Resolves Next Preference by combining with Desired Post, Area of Interest, or Club
function resolveNextPreference(nextPref, areaOfInterest, club, desiredPost, targetClubName) {
  if (!nextPref || nextPref.trim().toLowerCase() === 'none' || nextPref.trim().toLowerCase() === 'n/a') {
    return 'None';
  }
  const cleanPref = nextPref.trim();
  const cleanInterest = (areaOfInterest || '').trim();
  const cleanClub = (club || '').trim();
  const cleanDesired = (desiredPost || '').trim();
  const cleanTargetClub = (targetClubName || '').trim();

  // If next preference is Coordinator -> resolve to specific coordinator role from desired post if available!
  if (/^(coordinator|coord)$/i.test(cleanPref)) {
    if (cleanDesired && cleanDesired.toLowerCase() !== 'none') {
      return formatCoordinatorRole(cleanDesired);
    }
    if (cleanClub && cleanClub.toLowerCase() !== 'none') {
      return `${cleanClub} Club Coordinator`;
    }
    if (cleanInterest && cleanInterest.toLowerCase() !== 'none') {
      return `${cleanInterest} Coordinator`;
    }
    return 'Coordinator';
  }

  // If next preference is Club Chair
  if (/^(club chair|chair)$/i.test(cleanPref)) {
    if (cleanTargetClub) {
      return `Club Chair (${cleanTargetClub})`;
    }
    if (cleanClub) {
      return `Club Chair (${cleanClub})`;
    }
    return 'Club Chair';
  }

  // If next preference is Club Co-Chair
  if (/^(club co-chair|co-chair|co chair|club cochair)$/i.test(cleanPref)) {
    if (cleanClub) {
      return `Club Co-Chair (${cleanClub})`;
    }
    return 'Club Co-Chair';
  }

  // If next preference is Secretary
  if (/^(secretary|sec)$/i.test(cleanPref)) {
    if (cleanInterest && cleanInterest.toLowerCase() !== 'none') {
      return `Secretary of ${cleanInterest}`;
    }
    return 'Secretary';
  }

  // If next preference is General Secretary
  if (/^(general secretary|gen sec|gensec)$/i.test(cleanPref)) {
    if (cleanInterest && cleanInterest.toLowerCase() !== 'none') {
      return `General Secretary of ${cleanInterest}`;
    }
    return 'General Secretary';
  }

  return cleanPref;
}

// Position Hierarchy Classifier (Matches Panel Hierarchy)
function getPositionHierarchyInfo(posName, club, track) {
  const lowerPos = (posName || '').toLowerCase();
  const lowerTrack = (track || '').toLowerCase();
  let cleanClub = (club || '').trim();

  if (!cleanClub) {
    const parenMatch = (posName || '').match(/\(([^)]+)\)/);
    if (parenMatch) cleanClub = parenMatch[1].trim();
  }

  // 1. President
  if (lowerPos.includes('president') && !lowerPos.includes('vice')) {
    return {
      tier: 1,
      tierIcon: '👑',
      tierLabel: 'President',
      groupKey: 'tier-1-president',
      groupLabel: 'President',
      clubName: '',
      subTier: 1,
      orderKey: '1_00_president'
    };
  }

  // 2. General Secretary
  if (lowerPos.includes('general secretary') || lowerPos.includes('gen sec') || lowerPos.includes('gensec')) {
    return {
      tier: 2,
      tierIcon: '🏛️',
      tierLabel: 'General Secretary',
      groupKey: 'tier-2-gensec',
      groupLabel: 'General Secretary',
      clubName: '',
      subTier: 1,
      orderKey: '2_00_gensec'
    };
  }

  // 3. Secretary
  if (lowerPos.includes('secretary') || lowerPos.includes('sec')) {
    return {
      tier: 3,
      tierIcon: '📜',
      tierLabel: 'Secretary',
      groupKey: 'tier-3-sec',
      groupLabel: 'Secretary',
      clubName: '',
      subTier: 1,
      orderKey: '3_00_sec'
    };
  }

  // 4. Club Leadership
  const isClubTrack = lowerTrack.includes('club') || Boolean(cleanClub);
  const isClubChair = lowerPos.includes('chair') && !lowerPos.includes('co-chair') && !lowerPos.includes('co chair');
  const isClubCoChair = lowerPos.includes('co-chair') || lowerPos.includes('co chair') || lowerPos.includes('cochair');

  if (isClubTrack || isClubChair || isClubCoChair) {
    let subTier = 3;
    let roleType = 'Member';
    if (isClubChair) { subTier = 1; roleType = 'Club Chair'; }
    else if (isClubCoChair) { subTier = 2; roleType = 'Club Co-Chair'; }
    const cName = cleanClub || 'General';
    return {
      tier: 4,
      tierIcon: '🎭',
      tierLabel: 'Club Leadership',
      groupKey: 'tier-4-club-' + cName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      groupLabel: `Club Leadership · ${cName}`,
      clubName: cName,
      subTier,
      roleType,
      orderKey: '4_' + cName.toLowerCase() + '_' + subTier
    };
  }

  // 5. Coordinators (Section C / Desired Post / Other)
  return {
    tier: 5,
    tierIcon: '⚡',
    tierLabel: 'Coordinators',
    groupKey: 'tier-5-coordinators',
    groupLabel: 'Coordinators',
    clubName: '',
    subTier: 1,
    orderKey: '5_coord_' + posName.toLowerCase()
  };
}

const csvPath = path.join(__dirname, '..', 'JKLU_Student_Leadership_Selection_Sheet1___1_.csv');
const raw = fs.readFileSync(csvPath, 'utf-8');
const rows = parseCSV(raw);
const headers = rows[0];
const dataRows = rows.slice(1).filter(r => r.length > 1 && r.some(cell => cell.trim()));

const rawCandidates = [];

dataRows.forEach((r, idx) => {
  const obj = {};
  headers.forEach((h, i) => {
    obj[h] = (r[i] || '').trim();
  });

  const rawName = obj['Full name'] || obj['Name'] || `Candidate ${idx + 1}`;
  const rawRoll = obj['Roll Number'] || '';
  const rollNumber = normalizeRollNumber(rawRoll);
  const rawPosApplied = obj['Which Student Council position are you applying for?'] || obj['Which Club Leadership position are you applying for?'] || obj['What position are you applying for?'] || '';
  
  const batch = extractBatch(rawRoll, rawPosApplied);
  const programme = extractProgramme(rawRoll);

  const student = {
    originalIndex: idx + 1,
    id: obj['Id'] || String(idx + 1),
    name: formatName(rawName),
    email: obj['Email'] || '',
    rollNumber: rollNumber || 'N/A',
    phone: obj['Contact Number'] || '',
    batch: batch ? `Batch ${batch}` : '',
    programme: programme || '',
    rawCategory: obj['What position are you applying for?'] || '',
    posts: []
  };

  const scPos = obj['Which Student Council position are you applying for?'];
  const scExp = obj['Past Experience'];
  const scWhy = obj['Why Should We Choose You?'];
  const scInterest = obj['Area of Interest (If selecting President, fill this too as per your interest.)'];
  const scPref = obj['If not selected for your preferred position, what would be your next preference?'];

  const clubPos = obj['Which Club Leadership position are you applying for?'];
  const clubName = obj['Which Club?'];
  const clubExp = obj['Past Experience1'];
  const clubWhy = obj['Why Should We Choose You?1'];
  const clubPref = obj['If not selected for your preferred position, what would be your next preference?1'];

  const commPos = obj['Desired Post'];
  const commExp = obj['Past Experience2'];
  const commWhy = obj['Why Should We Choose You?2'];

  // 1. Student Council Position
  if (scPos || scExp || scWhy || scInterest) {
    const resolvedNextPref = resolveNextPreference(scPref, scInterest, '', commPos, clubName);
    student.posts.push({
      track: 'Student Council',
      trackColor: 'council',
      position: scPos || 'Student Council Role',
      areaOfInterest: scInterest || '',
      rawNextPreference: scPref || '',
      nextPreference: resolvedNextPref,
      pastExperience: scExp || 'Not provided',
      whyChooseYou: scWhy || 'Not provided',
      hierarchy: getPositionHierarchyInfo(scPos || 'Student Council Role', '', 'Student Council')
    });
  }

  // 2. Club Leadership Position
  if (clubPos || clubName || clubExp || clubWhy) {
    const resolvedNextPref = resolveNextPreference(clubPref, '', clubName, commPos, '');
    student.posts.push({
      track: 'Club Leadership',
      trackColor: 'club',
      position: clubPos || (clubName ? `Club Role - ${clubName}` : 'Club Leadership'),
      club: clubName || '',
      rawNextPreference: clubPref || '',
      nextPreference: resolvedNextPref,
      pastExperience: clubExp || 'Not provided',
      whyChooseYou: clubWhy || 'Not provided',
      hierarchy: getPositionHierarchyInfo(clubPos || 'Club Role', clubName || '', 'Club Leadership')
    });
  }

  // 3. Coordinator / Desired Post
  if (commPos || commExp || commWhy) {
    const coordFormatted = formatCoordinatorRole(commPos);
    student.posts.push({
      track: 'Coordinator',
      trackColor: 'coordinator',
      position: coordFormatted,
      rawNextPreference: '',
      nextPreference: '',
      pastExperience: commExp || 'Not provided',
      whyChooseYou: commWhy || 'Not provided',
      hierarchy: getPositionHierarchyInfo(coordFormatted, '', 'Coordinator')
    });
  }

  // If no specific post was recognized but row has rawCategory
  if (student.posts.length === 0 && student.rawCategory) {
    student.posts.push({
      track: 'General Application',
      trackColor: 'general',
      position: student.rawCategory,
      rawNextPreference: '',
      nextPreference: '',
      pastExperience: 'Not provided',
      whyChooseYou: 'Not provided',
      hierarchy: getPositionHierarchyInfo(student.rawCategory, '', 'General')
    });
  }

  // Determine top hierarchy rank for sorting candidate
  let bestHierarchy = student.posts[0] ? student.posts[0].hierarchy : getPositionHierarchyInfo('Other', '', '');
  for (const p of student.posts) {
    if (p.hierarchy.tier < bestHierarchy.tier) {
      bestHierarchy = p.hierarchy;
    } else if (p.hierarchy.tier === bestHierarchy.tier && p.hierarchy.orderKey < bestHierarchy.orderKey) {
      bestHierarchy = p.hierarchy;
    }
  }

  student.primaryHierarchy = bestHierarchy;
  rawCandidates.push(student);
});

// Sort Candidates Strictly by Position Hierarchy:
// Tier 1 (President) -> Tier 2 (Gen Sec) -> Tier 3 (Sec) -> Tier 4 (Clubs alphabetically, Chair then Co-Chair) -> Tier 5 (Coordinators)
rawCandidates.sort((a, b) => {
  if (a.primaryHierarchy.orderKey !== b.primaryHierarchy.orderKey) {
    return a.primaryHierarchy.orderKey.localeCompare(b.primaryHierarchy.orderKey);
  }
  return a.name.localeCompare(b.name);
});

// Re-index candidates in hierarchy order
const candidates = rawCandidates.map((c, i) => ({
  ...c,
  index: i + 1
}));

// Build hierarchy filter options
const hierarchyGroups = [];
const seenGroups = new Set();
candidates.forEach(c => {
  if (!seenGroups.has(c.primaryHierarchy.groupKey)) {
    seenGroups.add(c.primaryHierarchy.groupKey);
    hierarchyGroups.push({
      groupKey: c.primaryHierarchy.groupKey,
      groupLabel: c.primaryHierarchy.groupLabel,
      tierIcon: c.primaryHierarchy.tierIcon,
      count: candidates.filter(cand => cand.primaryHierarchy.groupKey === c.primaryHierarchy.groupKey).length
    });
  }
});

// Save json data
const jsonDir = path.join(__dirname, '..', 'public', 'data');
if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir, { recursive: true });
fs.writeFileSync(
  path.join(jsonDir, 'dossier_data.json'),
  JSON.stringify({ candidates, hierarchyGroups }, null, 2),
  'utf-8'
);

console.log(`Successfully parsed ${candidates.length} candidates in hierarchy order.`);

// Build standalone HTML
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JKLU Student Leadership Selection 2026-27 | Candidate Dossier & Evaluation Sheets</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #800000;
      --primary-dark: #5c0000;
      --primary-light: #fff5f5;
      --primary-border: #fecaca;
      --text-main: #1c1917;
      --text-muted: #57534e;
      --border-color: #e7e5e4;
      --body-bg: #f8fafc;
      --council-bg: #eff6ff;
      --council-border: #bfdbfe;
      --council-text: #1e40af;
      --club-bg: #f0fdf4;
      --club-border: #bbf7d0;
      --club-text: #166534;
      --coord-bg: #faf5ff;
      --coord-border: #e9d5ff;
      --coord-text: #6b21a8;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--body-bg);
      color: var(--text-main);
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Screen UI - Sticky Control Header */
    .screen-controls {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #ffffff;
      border-bottom: 2px solid #e2e8f0;
      box-shadow: 0 4px 12px -2px rgba(0,0,0,0.08);
      padding: 12px 24px;
    }

    .controls-container {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .controls-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-badge {
      background: var(--primary);
      color: white;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 4px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .brand-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }

    .controls-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .search-input {
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      font-size: 13px;
      font-family: inherit;
      width: 240px;
      transition: all 0.2s;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(128, 0, 0, 0.1);
    }

    .filter-select {
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      font-size: 13px;
      font-family: inherit;
      background-color: white;
      cursor: pointer;
    }

    .filter-select:focus {
      outline: none;
      border-color: var(--primary);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease-in-out;
      text-decoration: none;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 4px rgba(128, 0, 0, 0.2);
    }

    .btn-primary:hover {
      background: var(--primary-dark);
    }

    .btn-outline {
      background: white;
      color: #334155;
      border: 1px solid #cbd5e1;
    }

    .btn-outline:hover {
      background: #f1f5f9;
    }

    /* Stats bar */
    .stats-bar {
      max-width: 1200px;
      margin: 16px auto 0;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 12px;
      color: #64748b;
    }

    .stat-pill {
      background: #f1f5f9;
      padding: 3px 10px;
      border-radius: 20px;
      font-weight: 500;
    }

    .stat-pill strong {
      color: #0f172a;
    }

    /* Main Container */
    .document-wrapper {
      max-width: 960px;
      margin: 24px auto;
      padding: 0 20px;
    }

    /* Quick Index Card */
    .index-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 18px 22px;
      margin-bottom: 28px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .index-title {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 8px;
    }

    .index-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 8px;
      max-height: 320px;
      overflow-y: auto;
      padding-right: 6px;
    }

    .index-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      text-decoration: none;
      color: inherit;
      transition: all 0.15s;
    }

    .index-item:hover {
      background: var(--primary-light);
      border-color: var(--primary-border);
      color: var(--primary);
    }

    .index-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      background: #e2e8f0;
      padding: 1px 5px;
      border-radius: 4px;
      color: #475569;
    }

    .index-name {
      font-size: 12.5px;
      font-weight: 600;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .index-sub {
      font-size: 11px;
      color: #64748b;
    }

    /* Candidate Entry Page */
    .candidate-sheet {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      margin-bottom: 32px;
      padding: 26px 30px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
      position: relative;
    }

    /* Candidate Header */
    .sheet-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 14px;
      margin-bottom: 16px;
      gap: 16px;
    }

    .org-banner {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--primary);
      margin-bottom: 2px;
    }

    .candidate-name {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.3px;
    }

    .candidate-meta-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }

    .meta-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #e2e8f0;
    }

    .meta-tag.roll {
      font-family: 'JetBrains Mono', monospace;
      background: #fef2f2;
      color: var(--primary);
      border-color: #fecaca;
    }

    .meta-tag.hierarchy-tag {
      background: #eef2ff;
      color: #3730a3;
      border-color: #c7d2fe;
    }

    .sheet-index-stamp {
      text-align: right;
    }

    .stamp-number {
      font-size: 24px;
      font-weight: 900;
      font-family: 'JetBrains Mono', monospace;
      color: #94a3b8;
      line-height: 1;
    }

    .stamp-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
    }

    /* Candidate Contact & Info Grid */
    .info-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 18px;
    }

    .info-col-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 2px;
    }

    .info-col-val {
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
      word-break: break-all;
    }

    /* Application Post Block */
    .posts-section {
      margin-bottom: 18px;
    }

    .posts-section-heading {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #475569;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .posts-section-heading::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #e2e8f0;
    }

    .post-card {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      margin-bottom: 14px;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .post-header {
      padding: 10px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }

    .post-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .post-track-pill {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 4px;
      letter-spacing: 0.4px;
    }

    .track-council {
      background: var(--council-bg);
      color: var(--council-text);
      border: 1px solid var(--council-border);
    }

    .track-club {
      background: var(--club-bg);
      color: var(--club-text);
      border: 1px solid var(--club-border);
    }

    .track-coordinator {
      background: var(--coord-bg);
      color: var(--coord-text);
      border: 1px solid var(--coord-border);
    }

    .track-general {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }

    .post-role-name {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
    }

    .post-sub-info {
      font-size: 11px;
      color: #475569;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .sub-info-pill {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    /* Prominent Next Preference Banner */
    .next-pref-banner {
      background: #f0fdf4;
      border-bottom: 1px solid #bbf7d0;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11.5px;
    }

    .next-pref-left {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #166534;
      font-weight: 600;
    }

    .next-pref-tag {
      background: #dcfce7;
      color: #14532d;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid #86efac;
    }

    .next-pref-note {
      font-size: 10px;
      color: #15803d;
      font-style: italic;
    }

    .post-body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .field-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .field-label {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #334155;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .field-label-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .field-label-scope {
      font-size: 9.5px;
      font-weight: 600;
      color: #64748b;
      text-transform: none;
      letter-spacing: normal;
    }

    .field-content {
      font-size: 12px;
      line-height: 1.6;
      color: #1e293b;
      white-space: pre-wrap;
      background: #fafaf9;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 10px 12px;
    }

    .field-content.why-choose {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      font-weight: 500;
    }

    .field-content.past-exp {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #0f172a;
    }

    /* Hard-copy Evaluation & Scoring Panel (For interviewers) */
    .eval-sheet-section {
      background: #fdfdfd;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      padding: 14px 16px;
      page-break-inside: avoid;
      break-inside: avoid;
      margin-top: 14px;
    }

    .eval-section-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--primary);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .eval-grid-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 11px;
    }

    .eval-grid-table th, .eval-grid-table td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      text-align: left;
    }

    .eval-grid-table th {
      background: #f1f5f9;
      font-weight: 700;
      color: #334155;
    }

    .rubric-score-col {
      width: 80px;
      text-align: center !important;
    }

    .eval-score-box {
      border: 1px solid #94a3b8;
      background: #ffffff;
      height: 18px;
      width: 45px;
      margin: 0 auto;
      border-radius: 2px;
    }

    .eval-decision-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 8px;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
      padding: 6px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
    }

    .decision-options {
      display: flex;
      gap: 16px;
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .custom-checkbox {
      width: 13px;
      height: 13px;
      border: 1.5px solid #475569;
      border-radius: 2px;
      display: inline-block;
    }

    .eval-remarks-area {
      margin-top: 8px;
    }

    .remarks-lines {
      margin-top: 4px;
      border-bottom: 1px dotted #94a3b8;
      height: 18px;
    }

    .signature-row {
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
    }

    .sig-line {
      width: 180px;
      border-bottom: 1px solid #475569;
      display: inline-block;
      margin-left: 6px;
    }

    /* Print Specific Rules */
    @media print {
      body {
        background: #ffffff !important;
        font-size: 10.5pt;
        color: #000000;
      }

      .screen-controls, .index-card, .stats-bar {
        display: none !important;
      }

      .document-wrapper {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      .candidate-sheet {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 0 35px 0 !important;
        page-break-after: always !important;
        break-after: page !important;
      }

      .candidate-sheet:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }

      .post-card {
        border: 1.5px solid #475569 !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .next-pref-banner {
        background: #f0fdf4 !important;
        border-bottom: 1px solid #86efac !important;
      }

      .field-content {
        border: 1px solid #cbd5e1 !important;
        background: #fafafa !important;
        color: #000000 !important;
        font-size: 10pt !important;
      }

      .field-content.why-choose {
        background: #fffdf5 !important;
        border: 1px solid #d97706 !important;
        color: #78350f !important;
      }

      .info-bar {
        background: #f8fafc !important;
        border: 1px solid #94a3b8 !important;
      }

      .eval-sheet-section {
        border: 1.5px solid #000000 !important;
        background: #ffffff !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>

  <!-- Screen Control Bar -->
  <div class="screen-controls">
    <div class="controls-container">
      <div class="controls-brand">
        <span class="brand-badge">JKLU</span>
        <div>
          <div class="brand-title">Candidate Entry Dossier & Hard Copy Sheets</div>
          <div style="font-size: 11px; color: #64748b;">Leadership Selection 2026-27 · Preferred & Next Preference Entries</div>
        </div>
      </div>

      <div class="controls-actions">
        <input type="text" id="searchInput" class="search-input" placeholder="Search name, roll, post, keyword..." oninput="filterEntries()">
        
        <select id="hierarchyFilter" class="filter-select" onchange="filterEntries()">
          <option value="all">All Positions (${candidates.length})</option>
          ${hierarchyGroups.map(g => `
            <option value="${g.groupKey}">${g.tierIcon} ${g.groupLabel} (${g.count})</option>
          `).join('')}
        </select>

        <select id="batchFilter" class="filter-select" onchange="filterEntries()">
          <option value="all">All Batches</option>
          <option value="2024">Batch 2024</option>
          <option value="2025">Batch 2025</option>
          <option value="2026">Batch 2026</option>
        </select>

        <button class="btn btn-primary" onclick="window.print()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print / Export PDF
        </button>

        <button class="btn btn-outline" onclick="toggleIndex()">
          Index
        </button>
      </div>
    </div>
  </div>

  <div class="document-wrapper">
    <!-- Quick Stats -->
    <div class="stats-bar">
      <span class="stat-pill">Total Applicants: <strong id="statTotal">${candidates.length}</strong></span>
      <span class="stat-pill">Showing: <strong id="statShowing">${candidates.length}</strong></span>
      <span class="stat-pill">Hierarchy Order: <strong>President &gt; Gen Sec &gt; Secretary &gt; Clubs (Chairs/Co-Chairs) &gt; Coordinators</strong></span>
    </div>

    <!-- Candidate Quick Index Card -->
    <div class="index-card" id="indexSection">
      <div class="index-title">
        <span>Candidate Quick Index (${candidates.length} Applicants in Hierarchy Order)</span>
        <span style="font-size: 11px; font-weight: 500; color: #64748b;">Click candidate to jump</span>
      </div>
      <div class="index-grid">
        ${candidates.map(c => `
          <a href="#candidate-${c.index}" class="index-item">
            <span class="index-num">#${c.index}</span>
            <div style="min-width: 0; flex: 1;">
              <div class="index-name">${escapeHTML(c.name)}</div>
              <div class="index-sub">${c.primaryHierarchy.tierIcon} ${escapeHTML(c.primaryHierarchy.groupLabel)} · <span style="font-family: monospace;">${escapeHTML(c.rollNumber)}</span></div>
            </div>
          </a>
        `).join('')}
      </div>
    </div>

    <!-- Candidate Entries -->
    <div id="candidatesList">
      ${candidates.map(c => `
        <article class="candidate-sheet" id="candidate-${c.index}" data-name="${escapeHTML(c.name).toLowerCase()}" data-roll="${escapeHTML(c.rollNumber).toLowerCase()}" data-batch="${c.batch}" data-group="${c.primaryHierarchy.groupKey}">
          
          <!-- Sheet Header -->
          <div class="sheet-header">
            <div>
              <div class="org-banner">JK Lakshmipat University · Student Leadership Council 2026-27</div>
              <h2 class="candidate-name">${escapeHTML(c.name)}</h2>
              <div class="candidate-meta-badges">
                <span class="meta-tag roll">${escapeHTML(c.rollNumber)}</span>
                <span class="meta-tag hierarchy-tag">${c.primaryHierarchy.tierIcon} ${escapeHTML(c.primaryHierarchy.groupLabel)}</span>
                ${c.programme ? `<span class="meta-tag">${escapeHTML(c.programme)}</span>` : ''}
                ${c.batch ? `<span class="meta-tag">${escapeHTML(c.batch)}</span>` : ''}
                <span class="meta-tag">${c.posts.length} Post${c.posts.length !== 1 ? 's' : ''} Applied</span>
              </div>
            </div>
            <div class="sheet-index-stamp">
              <div class="stamp-number">#${String(c.index).padStart(3, '0')}</div>
              <div class="stamp-label">Candidate Entry</div>
            </div>
          </div>

          <!-- Student Contact & Profile Bar -->
          <div class="info-bar">
            <div>
              <div class="info-col-label">Email Address</div>
              <div class="info-col-val">${escapeHTML(c.email) || '—'}</div>
            </div>
            <div>
              <div class="info-col-label">Contact Phone</div>
              <div class="info-col-val">${escapeHTML(c.phone) || '—'}</div>
            </div>
            <div>
              <div class="info-col-label">Programme / Batch</div>
              <div class="info-col-val">${c.programme ? escapeHTML(c.programme) + ' · ' : ''}${escapeHTML(c.batch) || '—'}</div>
            </div>
            <div>
              <div class="info-col-label">Primary Target Post</div>
              <div class="info-col-val">${escapeHTML(c.posts[0] ? c.posts[0].position : c.rawCategory || 'General')}</div>
            </div>
          </div>

          <!-- Application Posts Section -->
          <div class="posts-section">
            <div class="posts-section-heading">Applied Positions & Detailed Responses (${c.posts.length})</div>
            
            ${c.posts.map((post, pIdx) => `
              <div class="post-card">
                <!-- Post Main Header -->
                <div class="post-header">
                  <div class="post-title-group">
                    <span class="post-track-pill track-${post.trackColor}">${escapeHTML(post.track)}</span>
                    <span class="post-role-name">Preferred Post #${pIdx + 1}: ${escapeHTML(post.position)}</span>
                  </div>
                  <div class="post-sub-info">
                    ${post.club ? `<span class="sub-info-pill"><strong>Club:</strong> ${escapeHTML(post.club)}</span>` : ''}
                    ${post.areaOfInterest ? `<span class="sub-info-pill"><strong>Area of Interest:</strong> ${escapeHTML(post.areaOfInterest)}</span>` : ''}
                  </div>
                </div>

                <!-- Next Preference Bar (Resolved with Desired Post / Club / Area of Interest) -->
                ${post.nextPreference && post.nextPreference !== 'None' ? `
                  <div class="next-pref-banner">
                    <div class="next-pref-left">
                      <span>↪ <strong>Next Preference:</strong></span>
                      <span class="next-pref-tag">${escapeHTML(post.nextPreference)}</span>
                    </div>
                    <div class="next-pref-note">Past Experience & Why Choose You below apply to both Preferred Post & Next Preference</div>
                  </div>
                ` : ''}

                <div class="post-body">
                  <!-- Past Experience -->
                  <div class="field-block">
                    <div class="field-label">
                      <div class="field-label-left">
                        <span>💼</span>
                        <span>Past Experience & Track Record</span>
                      </div>
                      <span class="field-label-scope">For ${escapeHTML(post.position)}${post.nextPreference && post.nextPreference !== 'None' ? ' & ' + escapeHTML(post.nextPreference) : ''}</span>
                    </div>
                    <div class="field-content past-exp">${escapeHTML(post.pastExperience)}</div>
                  </div>

                  <!-- Why Should We Choose You -->
                  <div class="field-block">
                    <div class="field-label">
                      <div class="field-label-left">
                        <span>🎯</span>
                        <span>Why Should We Choose You?</span>
                      </div>
                      <span class="field-label-scope">For ${escapeHTML(post.position)}${post.nextPreference && post.nextPreference !== 'None' ? ' & ' + escapeHTML(post.nextPreference) : ''}</span>
                    </div>
                    <div class="field-content why-choose">${escapeHTML(post.whyChooseYou)}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Interview Evaluation Panel (for physical panel scoring) -->
          <div class="eval-sheet-section">
            <div class="eval-section-title">
              <span>Interviewer Assessment & Rubric Scoring</span>
              <span style="font-weight: 500; font-size: 10px; color: #64748b;">Candidate #${c.index} · ${escapeHTML(c.name)} · ${escapeHTML(c.primaryHierarchy.groupLabel)}</span>
            </div>

            <table class="eval-grid-table">
              <thead>
                <tr>
                  <th>Assessment Parameter</th>
                  <th style="width: 50%;">Evaluator Observations / Evidence</th>
                  <th class="rubric-score-col">Max Marks</th>
                  <th class="rubric-score-col">Score</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>1. Vision & Strategic Thinking</strong><br><span style="font-size: 9.5px; color: #64748b;">Clarity of goals, alignment with council mission</span></td>
                  <td></td>
                  <td class="rubric-score-col">25</td>
                  <td class="rubric-score-col"><div class="eval-score-box"></div></td>
                </tr>
                <tr>
                  <td><strong>2. Relevant Experience & Execution</strong><br><span style="font-size: 9.5px; color: #64748b;">Past initiatives, organizational leadership proof</span></td>
                  <td></td>
                  <td class="rubric-score-col">25</td>
                  <td class="rubric-score-col"><div class="eval-score-box"></div></td>
                </tr>
                <tr>
                  <td><strong>3. Communication & Articulation</strong><br><span style="font-size: 9.5px; color: #64748b;">Confidence, clarity of thought, representation</span></td>
                  <td></td>
                  <td class="rubric-score-col">25</td>
                  <td class="rubric-score-col"><div class="eval-score-box"></div></td>
                </tr>
                <tr>
                  <td><strong>4. Problem Solving & Commitment</strong><br><span style="font-size: 9.5px; color: #64748b;">Handling student challenges, team collaboration</span></td>
                  <td></td>
                  <td class="rubric-score-col">25</td>
                  <td class="rubric-score-col"><div class="eval-score-box"></div></td>
                </tr>
                <tr style="background: #f8fafc; font-weight: 700;">
                  <td colspan="2" style="text-align: right; text-transform: uppercase;">Total Score:</td>
                  <td class="rubric-score-col">100</td>
                  <td class="rubric-score-col"><div class="eval-score-box"></div></td>
                </tr>
              </tbody>
            </table>

            <div class="eval-decision-row">
              <span>Panel Recommendation:</span>
              <div class="decision-options">
                <label class="checkbox-item"><span class="custom-checkbox"></span> Selected</label>
                <label class="checkbox-item"><span class="custom-checkbox"></span> Shortlisted</label>
                <label class="checkbox-item"><span class="custom-checkbox"></span> Waitlisted</label>
                <label class="checkbox-item"><span class="custom-checkbox"></span> Rejected</label>
              </div>
            </div>

            <div class="eval-remarks-area">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #475569;">Key Panel Remarks / Justification:</div>
              <div class="remarks-lines"></div>
              <div class="remarks-lines"></div>
            </div>

            <div class="signature-row">
              <div>Evaluator Name: <span class="sig-line"></span></div>
              <div>Evaluator Signature: <span class="sig-line"></span></div>
              <div>Date: <span style="width: 90px; border-bottom: 1px solid #475569; display: inline-block;"></span></div>
            </div>
          </div>

        </article>
      `).join('')}
    </div>
  </div>

  <script>
    function toggleIndex() {
      const el = document.getElementById('indexSection');
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    function filterEntries() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      const groupFilter = document.getElementById('hierarchyFilter').value;
      const batch = document.getElementById('batchFilter').value;

      const sheets = document.querySelectorAll('.candidate-sheet');
      let visible = 0;

      sheets.forEach(sheet => {
        const name = sheet.getAttribute('data-name') || '';
        const roll = sheet.getAttribute('data-roll') || '';
        const sheetBatch = sheet.getAttribute('data-batch') || '';
        const sheetGroup = sheet.getAttribute('data-group') || '';
        const textContent = sheet.innerText.toLowerCase();

        let matchesSearch = !q || name.includes(q) || roll.includes(q) || textContent.includes(q);
        let matchesGroup = groupFilter === 'all' || sheetGroup === groupFilter;
        let matchesBatch = batch === 'all' || sheetBatch.includes(batch);

        if (matchesSearch && matchesGroup && matchesBatch) {
          sheet.style.display = 'block';
          visible++;
        } else {
          sheet.style.display = 'none';
        }
      });

      document.getElementById('statShowing').innerText = visible;
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '..', 'public', 'student_dossier.html'), html, 'utf-8');
fs.writeFileSync(path.join(__dirname, '..', 'student_entries_dossier.html'), html, 'utf-8');
console.log('Successfully generated public/student_dossier.html and student_entries_dossier.html');
