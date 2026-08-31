// ============================================================
// Position Hierarchy & Sorting Utility
//
// Hierarchy Rules:
// 1. President (e.g., President - Batch 2024)
// 2. General Secretary (e.g., General Secretary - Batch 2024)
// 3. Secretary (e.g., Secretary - Batch 2025)
// 4. Club Leadership (Chairs & Co-Chairs):
//    - Grouped by Club alphabetically
//    - Within each club: Club Chair first, followed immediately by Club Co-Chair
// 5. Coordinators (sorted alphabetically by post name)
// 6. Other positions
// ============================================================

export interface PositionDescriptor {
  position?: string;
  name?: string;
  club?: string;
  track?: string;
}

export interface HierarchyInfo {
  tier: number;         // 1: President, 2: Gen Sec, 3: Sec, 4: Club, 5: Coord, 6: Other
  tierLabel: string;
  clubName: string;     // For grouping club chair & co-chair together
  subTier: number;      // For club: 1: Chair, 2: Co-Chair, 3: Other
  normalizedName: string;
}

/**
 * Parses and extracts hierarchy sorting keys for any position object or string.
 */
export function getPositionHierarchyInfo(
  item: PositionDescriptor | string,
  explicitClub?: string,
  explicitTrack?: string
): HierarchyInfo {
  let posName = '';
  let club = explicitClub || '';
  let track = explicitTrack || '';

  if (typeof item === 'string') {
    posName = item.trim();
  } else if (item) {
    posName = (item.name || item.position || '').trim();
    club = club || item.club || '';
    track = track || item.track || '';
  }

  const lowerPos = posName.toLowerCase();
  const lowerTrack = track.toLowerCase();

  // Try extracting club from position name if not provided (e.g. "Club Chair (Art)" or "Club Chair - Art")
  if (!club) {
    const parenMatch = posName.match(/\(([^)]+)\)/);
    if (parenMatch) {
      club = parenMatch[1].trim();
    }
  }

  // 1. President
  if (lowerPos.includes('president') && !lowerPos.includes('vice')) {
    return {
      tier: 1,
      tierLabel: 'President',
      clubName: '',
      subTier: 1,
      normalizedName: posName,
    };
  }

  // 2. General Secretary
  if (
    lowerPos.includes('general secretary') ||
    lowerPos.includes('gen sec') ||
    lowerPos.includes('gensec')
  ) {
    return {
      tier: 2,
      tierLabel: 'General Secretary',
      clubName: '',
      subTier: 1,
      normalizedName: posName,
    };
  }

  // 3. Secretary (excluding General Secretary)
  if (lowerPos.includes('secretary') || lowerPos.includes('sec')) {
    return {
      tier: 3,
      tierLabel: 'Secretary',
      clubName: '',
      subTier: 1,
      normalizedName: posName,
    };
  }

  // 4. Club Leadership (Club Chair and Club Co-Chair)
  const isClubTrack = lowerTrack.includes('club') || Boolean(club);
  const isClubChair = lowerPos.includes('chair') && !lowerPos.includes('co-chair') && !lowerPos.includes('co chair');
  const isClubCoChair = lowerPos.includes('co-chair') || lowerPos.includes('co chair') || lowerPos.includes('cochair');

  if (isClubTrack || isClubChair || isClubCoChair) {
    let subTier = 3;
    if (isClubChair) subTier = 1;
    else if (isClubCoChair) subTier = 2;

    const cleanClub = (club || 'General').trim();
    return {
      tier: 4,
      tierLabel: 'Club Leadership',
      clubName: cleanClub.toLowerCase(),
      subTier,
      normalizedName: `${cleanClub} - ${posName}`,
    };
  }

  // 5. Coordinator
  if (lowerTrack.includes('coord') || lowerPos.includes('coord')) {
    return {
      tier: 5,
      tierLabel: 'Coordinator',
      clubName: '',
      subTier: 1,
      normalizedName: posName,
    };
  }

  // 6. Default / Other Student Council / Custom positions
  if (lowerTrack.includes('student council')) {
    return {
      tier: 3.5,
      tierLabel: 'Student Council',
      clubName: '',
      subTier: 1,
      normalizedName: posName,
    };
  }

  return {
    tier: 6,
    tierLabel: 'Other',
    clubName: '',
    subTier: 1,
    normalizedName: posName,
  };
}

/**
 * Comparator to sort two positions based on hierarchy:
 * 1. President
 * 2. General Secretary
 * 3. Secretary
 * 4. Club Leadership: Club by Club (alphabetical), with Chair then Co-Chair
 * 5. Coordinator (alphabetical)
 * 6. Other (alphabetical)
 */
export function comparePositions(
  a: PositionDescriptor | string,
  b: PositionDescriptor | string
): number {
  const infoA = getPositionHierarchyInfo(a);
  const infoB = getPositionHierarchyInfo(b);

  // 1. Compare major tier (President < GenSec < Sec < Club < Coord < Other)
  if (infoA.tier !== infoB.tier) {
    return infoA.tier - infoB.tier;
  }

  // 2. If both are Club Leadership (Tier 4):
  if (infoA.tier === 4) {
    // First group by Club Name (alphabetical)
    const clubCompare = infoA.clubName.localeCompare(infoB.clubName);
    if (clubCompare !== 0) return clubCompare;

    // Inside same club: Chair (subTier 1) before Co-Chair (subTier 2)
    if (infoA.subTier !== infoB.subTier) {
      return infoA.subTier - infoB.subTier;
    }

    // Tie-breaker: position name
    return infoA.normalizedName.localeCompare(infoB.normalizedName);
  }

  // 3. For Tier 1, 2, 3, 5, 6: Alphabetical within tier
  return infoA.normalizedName.localeCompare(infoB.normalizedName);
}

/**
 * Sorts any array of items by their position hierarchy.
 */
export function sortByPositionHierarchy<T>(
  items: T[],
  getPositionDescriptor: (item: T) => PositionDescriptor | string
): T[] {
  return [...items].sort((a, b) =>
    comparePositions(getPositionDescriptor(a), getPositionDescriptor(b))
  );
}

/**
 * Formats a clean display name with club name if applicable.
 */
export function getPositionDisplayName(
  posName: string,
  club?: string
): string {
  if (!posName) return '';
  const trimmed = posName.trim();
  if (club && !trimmed.toLowerCase().includes(club.toLowerCase())) {
    return `${trimmed} (${club})`;
  }
  return trimmed;
}
