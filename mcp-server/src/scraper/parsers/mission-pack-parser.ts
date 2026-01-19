import type { NewMission, NewSecondaryObjective } from '../../db/schema.js';

export interface ParsedMissionPack {
  missions: NewMission[];
  secondaryObjectives: NewSecondaryObjective[];
  gambits: ParsedGambit[];
  rules: ParsedMatchedPlayRule[];
}

export interface ParsedGambit {
  slug: string;
  name: string;
  description: string;
  timing: string;
  effect: string;
}

export interface ParsedMatchedPlayRule {
  slug: string;
  title: string;
  category: string;
  content: string;
}

/**
 * Parses Chapter Approved / Mission Pack markdown from Wahapedia
 */
export function parseMissionPack(markdown: string, sourceUrl: string, missionType: string = 'chapter_approved'): ParsedMissionPack {
  const result: ParsedMissionPack = {
    missions: [],
    secondaryObjectives: [],
    gambits: [],
    rules: [],
  };

  // Parse different sections
  result.missions = parsePrimaryMissions(markdown, sourceUrl, missionType);
  result.secondaryObjectives = parseSecondaryMissions(markdown, sourceUrl);
  result.gambits = parseChallengers(markdown);
  result.rules = parseMatchedPlayRules(markdown);

  return result;
}

/**
 * Parse primary mission cards from the "## Primary Mission deck" section
 * Format: "Primary Mission\n\nMISSION_NAME\n\nDescription..."
 */
function parsePrimaryMissions(markdown: string, sourceUrl: string, missionType: string): NewMission[] {
  const missions: NewMission[] = [];

  // Find the Primary Mission deck section
  const primaryDeckMatch = markdown.match(/## Primary Mission deck([\s\S]*?)(?=## (?:Secondary|Asymmetric|Incursion|Strike)|$)/i);
  if (!primaryDeckMatch) return missions;

  const primaryDeckContent = primaryDeckMatch[1] || '';

  // Split by "Primary Mission" markers to get individual missions
  // Pattern: "Primary Mission\n\n" followed by mission name in CAPS
  const missionBlocks = primaryDeckContent.split(/\nPrimary Mission\n/i).filter(Boolean);

  for (const block of missionBlocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // First non-empty line should be the mission name (in CAPS)
    let nameIndex = 0;
    while (nameIndex < lines.length && !lines[nameIndex]?.trim()) nameIndex++;
    if (nameIndex >= lines.length) continue;

    const name = lines[nameIndex]!.trim();

    // Skip if this doesn't look like a mission name (should be mostly uppercase)
    if (!name || name.length < 3 || !/^[A-Z\s]+$/.test(name.replace(/[^A-Za-z\s]/g, ''))) continue;

    // Get the rest as content
    const content = lines.slice(nameIndex + 1).join('\n').trim();

    // Extract description (text before the first **WHEN:** or scoring section)
    const descMatch = content.match(/^([\s\S]*?)(?=\n(?:SECOND|ANY|FIRST|START|\*\*WHEN|\|))/i);
    const description = descMatch ? descMatch[1]?.trim() : '';

    // Extract scoring rules (everything after description)
    const scoringRules = content.replace(description, '').trim();

    // Check for action definitions
    const actionMatch = content.match(/\(ACTION\)([\s\S]*?)(?=\n(?:SECOND|ANY|FIRST|START OF THE BATTLE|\*\*WHEN))/i);
    const missionRule = actionMatch ? actionMatch[0]?.trim() : null;

    missions.push({
      slug: slugify(name),
      name: toTitleCase(name),
      missionType,
      primaryObjective: scoringRules || content,
      deployment: null,
      missionRule: missionRule || (description || null),
      sourceUrl,
      dataSource: 'wahapedia',
    });
  }

  return missions;
}

/**
 * Parse secondary mission cards from the "## Secondary Mission deck" section
 * Format: "Secondary Mission\n\nMISSION_NAME\n\nDescription..."
 */
function parseSecondaryMissions(markdown: string, sourceUrl: string): NewSecondaryObjective[] {
  const objectives: NewSecondaryObjective[] = [];

  // Find the Secondary Mission deck section
  const secondaryDeckMatch = markdown.match(/## Secondary Mission deck([\s\S]*?)(?=## (?:Asymmetric|Challenger|Twist|Deployment|Primary)|$)/i);
  if (!secondaryDeckMatch) return objectives;

  const secondaryDeckContent = secondaryDeckMatch[1] || '';

  // Split by "Secondary Mission" markers
  const missionBlocks = secondaryDeckContent.split(/\nSecondary Mission\n/i).filter(Boolean);

  for (const block of missionBlocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // First non-empty line should be the mission name (in CAPS)
    let nameIndex = 0;
    while (nameIndex < lines.length && !lines[nameIndex]?.trim()) nameIndex++;
    if (nameIndex >= lines.length) continue;

    const name = lines[nameIndex]!.trim();

    // Skip if this doesn't look like a mission name
    if (!name || name.length < 3 || !/^[A-Z\s]+$/.test(name.replace(/[^A-Za-z\s]/g, ''))) continue;

    // Get the rest as content
    const content = lines.slice(nameIndex + 1).join('\n').trim();

    // Extract description (fluff text before **When Drawn:** or scoring table)
    const descMatch = content.match(/^([\s\S]*?)(?=\n(?:\*\*When Drawn|\|.*\|))/i);
    const description = descMatch ? descMatch[1]?.trim() : content.substring(0, 500);

    // Determine category based on content
    let category = 'tactical'; // default
    if (content.includes('FIXED') && content.includes('TACTICAL')) {
      category = 'both'; // can be used as either
    } else if (content.includes('Fixed Mission')) {
      category = 'fixed';
    }

    // Try to extract max points from content
    const maxPointsMatch = content.match(/(\d+)VP/g);
    const maxPoints = maxPointsMatch
      ? Math.max(...maxPointsMatch.map(m => parseInt(m.replace('VP', ''), 10)))
      : null;

    // Extract scoring condition
    const scoringMatch = content.match(/\*\*WHEN:\*\*[^|]*([\s\S]*?)(?=\n\||\n\n\*\*|$)/i);
    const scoringCondition = scoringMatch ? scoringMatch[0]?.trim() : null;

    objectives.push({
      slug: slugify(name),
      name: toTitleCase(name),
      category,
      description: description || content.substring(0, 1000),
      scoringCondition,
      maxPoints,
      factionId: null,
      sourceUrl,
      dataSource: 'wahapedia',
    });
  }

  return objectives;
}

/**
 * Parse Challenger cards (similar to gambits)
 * These appear in the ## Challenger deck section
 */
function parseChallengers(markdown: string): ParsedGambit[] {
  const challengers: ParsedGambit[] = [];

  // Find the Challenger deck section
  const challengerMatch = markdown.match(/## Challenger deck([\s\S]*?)(?=## (?:Twist|Deployment|Primary|Secondary)|$)/i);
  if (!challengerMatch) return challengers;

  const challengerContent = challengerMatch[1] || '';

  // Split by "Challenger" markers (or similar card patterns)
  const cardBlocks = challengerContent.split(/\nChallenger\n/i).filter(Boolean);

  for (const block of cardBlocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // First non-empty line should be the card name
    let nameIndex = 0;
    while (nameIndex < lines.length && !lines[nameIndex]?.trim()) nameIndex++;
    if (nameIndex >= lines.length) continue;

    const name = lines[nameIndex]!.trim();
    if (!name || name.length < 3) continue;

    const content = lines.slice(nameIndex + 1).join('\n').trim();

    // Extract timing and effect
    const whenMatch = content.match(/\*\*WHEN:\*\*\s*(.*?)(?:\n|$)/i);
    const effectMatch = content.match(/\*\*EFFECT:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i);

    challengers.push({
      slug: slugify(name),
      name: toTitleCase(name),
      description: content,
      timing: whenMatch ? whenMatch[1]?.trim() || '' : '',
      effect: effectMatch ? effectMatch[1]?.trim() || '' : content,
    });
  }

  return challengers;
}

/**
 * Parse general matched play rules from various sections
 */
function parseMatchedPlayRules(markdown: string): ParsedMatchedPlayRule[] {
  const rules: ParsedMatchedPlayRule[] = [];

  // Define sections to extract
  const rulePatterns: { pattern: RegExp; category: string }[] = [
    { pattern: /### Chapter Approved Battles([\s\S]*?)(?=###|## |$)/i, category: 'battle_sequence' },
    { pattern: /### Set Mission Parameters([\s\S]*?)(?=###|## |$)/i, category: 'mission_parameters' },
    { pattern: /### Muster Armies([\s\S]*?)(?=###|## |$)/i, category: 'army_construction' },
    { pattern: /### Determine Mission([\s\S]*?)(?=###|## |$)/i, category: 'determine_mission' },
    { pattern: /### Place Objective Markers([\s\S]*?)(?=###|## |$)/i, category: 'objectives' },
    { pattern: /### Create The Battlefield([\s\S]*?)(?=###|## |$)/i, category: 'terrain' },
    { pattern: /### Select Secondary Missions([\s\S]*?)(?=###|## |$)/i, category: 'secondary_selection' },
    { pattern: /### Deploy Armies([\s\S]*?)(?=###|## |$)/i, category: 'deployment' },
    { pattern: /### Challenger Cards([\s\S]*?)(?=###|## |$)/i, category: 'challengers' },
    { pattern: /### Determine Victor([\s\S]*?)(?=###|## |$)/i, category: 'victory_conditions' },
    { pattern: /### Terrain Layouts?([\s\S]*?)(?=###|## |$)/i, category: 'terrain_layouts' },
  ];

  for (const { pattern, category } of rulePatterns) {
    const match = markdown.match(pattern);
    if (match && match[1]) {
      const content = match[1].trim();
      if (content.length > 50) {
        // Extract title from the pattern
        const titleMatch = pattern.source.match(/### ([^(]+)/);
        const title = titleMatch ? titleMatch[1]?.replace(/\\/g, '') || category : category;

        rules.push({
          slug: slugify(title),
          title: title.trim(),
          category,
          content: content.substring(0, 5000), // Limit content size
        });
      }
    }
  }

  return rules;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Detect mission pack type from URL
 */
export function detectMissionPackType(url: string): string {
  if (url.includes('chapter-approved-2025-26')) return 'chapter_approved_2025';
  if (url.includes('chapter-approved')) return 'chapter_approved';
  if (url.includes('pariah-nexus')) return 'pariah_nexus';
  if (url.includes('leviathan')) return 'leviathan';
  return 'matched_play';
}
