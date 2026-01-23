import * as cheerio from 'cheerio';
import type { NewMission, NewSecondaryObjective } from '../../db/schema.js';
import { slugify, toTitleCase, DeduplicationTracker } from './utils.js';
import {
  FALLBACK_DESCRIPTION_MAX_LENGTH,
  SHORT_DESCRIPTION_MAX_LENGTH,
  RULE_CONTENT_MAX_LENGTH,
  truncateSlug,
  truncateName,
} from './constants.js';

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
 * Parses Chapter Approved / Mission Pack HTML from Wahapedia
 */
export function parseMissionPack(
  html: string,
  sourceUrl: string,
  missionType: string = 'chapter_approved'
): ParsedMissionPack {
  const result: ParsedMissionPack = {
    missions: [],
    secondaryObjectives: [],
    gambits: [],
    rules: [],
  };

  // Parse different sections
  result.missions = parsePrimaryMissions(html, sourceUrl, missionType);
  result.secondaryObjectives = parseSecondaryMissions(html, sourceUrl);
  result.gambits = parseChallengers(html);
  result.rules = parseMatchedPlayRules(html);

  return result;
}

/**
 * Check if a string looks like a valid mission name (mostly uppercase)
 */
function isValidMissionName(name: string): boolean {
  if (!name || name.length < 3) return false;
  const lettersOnly = name.replace(/[^A-Za-z\s]/g, '');
  return /^[A-Z\s]+$/.test(lettersOnly);
}

/**
 * Parse primary mission cards from HTML.
 * Looks for mission card structures following "Primary Mission deck" section.
 */
function parsePrimaryMissions(
  html: string,
  sourceUrl: string,
  missionType: string
): NewMission[] {
  const $ = cheerio.load(html);
  const missions: NewMission[] = [];
  const seen = new DeduplicationTracker();

  // Find mission card elements - Wahapedia may use various class patterns
  // Look for mission cards that follow the primary missions section
  $('div[class*="mission"], div[class*="Mission"], .card').each((_, el) => {
    const $card = $(el);
    const cardText = $card.text().trim();

    // Skip if this doesn't look like a mission card
    if (cardText.length < 20) return;

    // Look for mission name (usually in h3, h4, or emphasized text)
    let name = '';
    const $title = $card.find('h3, h4, .mission-title, b:first').first();
    if ($title.length) {
      name = $title.text().trim();
    }

    // Fallback: look for uppercase text at the start
    if (!name || !isValidMissionName(name)) {
      const firstLine = cardText.split('\n')[0]?.trim() || '';
      if (isValidMissionName(firstLine)) {
        name = firstLine;
      }
    }

    if (!name || !seen.addIfNew(name)) return;

    // Extract description and scoring rules
    const content = cardText.replace(name, '').trim();
    const description = content.slice(0, FALLBACK_DESCRIPTION_MAX_LENGTH);

    // Look for scoring patterns (VP mentions)
    const vpMatch = content.match(/(\d+)VP/g);
    const scoringRules = vpMatch ? content : null;

    // Look for action markers
    const hasAction = content.includes('(ACTION)') || content.includes('Action:');
    const missionRule = hasAction ? content : description;

    missions.push({
      slug: truncateSlug(slugify(name)),
      name: truncateName(toTitleCase(name)),
      missionType,
      primaryObjective: scoringRules || content.slice(0, RULE_CONTENT_MAX_LENGTH),
      deployment: null,
      missionRule: missionRule.slice(0, RULE_CONTENT_MAX_LENGTH) || null,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  });

  // Alternative: parse from structured list items
  $('li:contains("Primary Mission"), .primary-mission').each((_, el) => {
    const $item = $(el);
    const text = $item.text().trim();

    // Skip very short items
    if (text.length < 20) return;

    // Extract name from the beginning (usually in caps)
    const lines = text.split('\n');
    const nameLine = lines[0]?.trim() || '';

    if (!nameLine || !isValidMissionName(nameLine)) return;
    if (!seen.addIfNew(nameLine)) return;

    const content = lines.slice(1).join('\n').trim();

    missions.push({
      slug: truncateSlug(slugify(nameLine)),
      name: truncateName(toTitleCase(nameLine)),
      missionType,
      primaryObjective: content.slice(0, RULE_CONTENT_MAX_LENGTH) || null,
      deployment: null,
      missionRule: content.slice(0, RULE_CONTENT_MAX_LENGTH) || null,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  });

  return missions;
}

/**
 * Parse secondary mission cards from HTML.
 */
function parseSecondaryMissions(
  html: string,
  sourceUrl: string
): NewSecondaryObjective[] {
  const $ = cheerio.load(html);
  const objectives: NewSecondaryObjective[] = [];
  const seen = new DeduplicationTracker();

  // Find secondary mission cards
  $('div[class*="secondary"], div[class*="Secondary"], .secondary-mission').each(
    (_, el) => {
      const $card = $(el);
      const cardText = $card.text().trim();

      if (cardText.length < 20) return;

      // Extract name
      let name = '';
      const $title = $card.find('h3, h4, .mission-title, b:first').first();
      if ($title.length) {
        name = $title.text().trim();
      }

      if (!name || !isValidMissionName(name)) {
        const firstLine = cardText.split('\n')[0]?.trim() || '';
        if (isValidMissionName(firstLine)) {
          name = firstLine;
        }
      }

      if (!name || !seen.addIfNew(name)) return;

      const content = cardText.replace(name, '').trim();

      // Determine category
      let category = 'tactical';
      if (content.includes('FIXED') && content.includes('TACTICAL')) {
        category = 'both';
      } else if (content.includes('Fixed Mission')) {
        category = 'fixed';
      }

      // Extract max points
      const vpMatches = content.match(/(\d+)VP/g);
      const maxPoints = vpMatches
        ? Math.max(...vpMatches.map((m) => parseInt(m.replace('VP', ''), 10)))
        : null;

      // Extract scoring condition
      let scoringCondition: string | null = null;
      const $when = $card.find('b:contains("WHEN:"), .when');
      if ($when.length) {
        scoringCondition = $when.parent().text().trim();
      }

      objectives.push({
        slug: truncateSlug(slugify(name)),
        name: truncateName(toTitleCase(name)),
        category,
        description: content.slice(0, SHORT_DESCRIPTION_MAX_LENGTH),
        scoringCondition,
        maxPoints,
        factionId: null,
        sourceUrl,
        dataSource: 'wahapedia' as const,
      });
    }
  );

  // Alternative: parse from list items
  $('li:contains("Secondary Mission"), .secondary-objective').each((_, el) => {
    const $item = $(el);
    const text = $item.text().trim();

    if (text.length < 20) return;

    const lines = text.split('\n');
    const nameLine = lines[0]?.trim() || '';

    if (!nameLine || !isValidMissionName(nameLine)) return;
    if (!seen.addIfNew(nameLine)) return;

    const content = lines.slice(1).join('\n').trim();

    objectives.push({
      slug: truncateSlug(slugify(nameLine)),
      name: truncateName(toTitleCase(nameLine)),
      category: 'tactical',
      description: content.slice(0, SHORT_DESCRIPTION_MAX_LENGTH) || nameLine,
      scoringCondition: null,
      maxPoints: null,
      factionId: null,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  });

  return objectives;
}

/**
 * Parse Challenger/Gambit cards from HTML.
 */
function parseChallengers(html: string): ParsedGambit[] {
  const $ = cheerio.load(html);
  const challengers: ParsedGambit[] = [];
  const seen = new DeduplicationTracker();

  // Find challenger cards
  $('div[class*="challenger"], div[class*="Challenger"], .gambit').each(
    (_, el) => {
      const $card = $(el);
      const cardText = $card.text().trim();

      if (cardText.length < 20) return;

      // Extract name
      let name = '';
      const $title = $card.find('h3, h4, .title, b:first').first();
      if ($title.length) {
        name = $title.text().trim();
      }

      if (!name || name.length < 3) return;
      if (!seen.addIfNew(name)) return;

      const content = cardText.replace(name, '').trim();

      // Extract timing
      let timing = '';
      const $when = $card.find('b:contains("WHEN:"), .when');
      if ($when.length) {
        timing = $when.next().text().trim() || $when.parent().text().replace('WHEN:', '').trim();
      }

      // Extract effect
      let effect = content;
      const $effect = $card.find('b:contains("EFFECT:"), .effect');
      if ($effect.length) {
        effect = $effect.next().text().trim() || $effect.parent().text().replace('EFFECT:', '').trim();
      }

      challengers.push({
        slug: truncateSlug(slugify(name)),
        name: truncateName(toTitleCase(name)),
        description: content.slice(0, RULE_CONTENT_MAX_LENGTH),
        timing,
        effect: effect.slice(0, RULE_CONTENT_MAX_LENGTH),
      });
    }
  );

  return challengers;
}

/**
 * Parse general matched play rules from HTML sections.
 */
function parseMatchedPlayRules(html: string): ParsedMatchedPlayRule[] {
  const $ = cheerio.load(html);
  const rules: ParsedMatchedPlayRule[] = [];

  // Define rule sections to look for
  const ruleSections: { selector: string; category: string; titleOverride?: string }[] = [
    { selector: 'a[name*="Chapter-Approved-Battles"], h3:contains("Chapter Approved Battles")', category: 'battle_sequence', titleOverride: 'Chapter Approved Battles' },
    { selector: 'a[name*="Set-Mission-Parameters"], h3:contains("Set Mission Parameters")', category: 'mission_parameters', titleOverride: 'Set Mission Parameters' },
    { selector: 'a[name*="Muster-Armies"], h3:contains("Muster Armies")', category: 'army_construction', titleOverride: 'Muster Armies' },
    { selector: 'a[name*="Determine-Mission"], h3:contains("Determine Mission")', category: 'determine_mission', titleOverride: 'Determine Mission' },
    { selector: 'a[name*="Place-Objective"], h3:contains("Place Objective")', category: 'objectives', titleOverride: 'Place Objective Markers' },
    { selector: 'a[name*="Create-The-Battlefield"], h3:contains("Create The Battlefield")', category: 'terrain', titleOverride: 'Create The Battlefield' },
    { selector: 'a[name*="Select-Secondary"], h3:contains("Select Secondary")', category: 'secondary_selection', titleOverride: 'Select Secondary Missions' },
    { selector: 'a[name*="Deploy-Armies"], h3:contains("Deploy Armies")', category: 'deployment', titleOverride: 'Deploy Armies' },
    { selector: 'a[name*="Challenger-Cards"], h3:contains("Challenger Cards")', category: 'challengers', titleOverride: 'Challenger Cards' },
    { selector: 'a[name*="Determine-Victor"], h3:contains("Determine Victor")', category: 'victory_conditions', titleOverride: 'Determine Victor' },
    { selector: 'a[name*="Terrain-Layout"], h3:contains("Terrain Layout")', category: 'terrain_layouts', titleOverride: 'Terrain Layouts' },
  ];

  for (const { selector, category, titleOverride } of ruleSections) {
    const $section = $(selector).first();
    if (!$section.length) continue;

    // Get content from the section
    const $parent = $section.parent();
    let content = '';

    // Try to get content from following siblings until next section
    const $nextElements = $section.nextAll().slice(0, 10);
    content = $nextElements.map((_, el) => $(el).text().trim()).get().join('\n').trim();

    if (!content || content.length < 50) {
      // Fallback: get parent's text content
      content = $parent.text().trim();
    }

    if (content.length < 50) continue;

    const title = titleOverride || category;

    rules.push({
      slug: truncateSlug(slugify(title)),
      title: truncateName(title),
      category,
      content: content.slice(0, RULE_CONTENT_MAX_LENGTH),
    });
  }

  return rules;
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
