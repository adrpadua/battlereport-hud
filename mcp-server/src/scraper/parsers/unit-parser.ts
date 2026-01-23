import * as cheerio from 'cheerio';
import type { NewUnit, NewWeapon, NewAbility } from '../../db/schema.js';
import {
  TITLE_UNIT_NAME,
  INLINE_STATS,
  INVULN_SECTION_HEADER,
  INVULN_HAS_PATTERN,
  STANDALONE_POINTS,
  TABLE_POINTS_FORMAT,
  LEADER_ATTACHMENT_INFO,
  KEYWORDS_SECTION,
  BASE_SIZE,
  BRACKETED_ABILITY,
  FILTER_UI_TEXT,
  PIPE_SUFFIX,
  BRACKET_SUFFIX,
  WAHAPEDIA_SUFFIX,
  POINTS_ARTIFACT,
  CP_COST_MARKER,
} from './regex-patterns.js';
import {
  slugify,
  normalizeText,
  dedupeKeywords,
  DeduplicationTracker,
} from './utils.js';
import {
  SLUG_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SHORT_DESCRIPTION_MAX_LENGTH,
  MAX_LEADER_ATTACHMENTS,
  isValidPointsCost,
} from './constants.js';
import {
  type WahapediaSettings,
  DEFAULT_WAHAPEDIA_SETTINGS,
  WAHAPEDIA_CSS_SELECTORS,
} from '../firecrawl-client.js';

interface ParsedUnit {
  unit: Omit<NewUnit, 'factionId'>;
  weapons: NewWeapon[];
  abilities: Omit<NewAbility, 'factionId'>[];
}

interface ParseOptions {
  /** Wahapedia content filter settings. Default: DEFAULT_WAHAPEDIA_SETTINGS */
  wahapediaSettings?: WahapediaSettings;
}

interface UnitStats {
  movement?: string;
  toughness?: number;
  save?: string;
  wounds?: number;
  leadership?: number;
  objectiveControl?: number;
  invulnerableSave?: string;
}

/**
 * Remove elements from the DOM that match Wahapedia's visibility CSS classes.
 * This filters out content like fluff text, Legends, Forge World, etc.
 */
function applyWahapediaFilters($: cheerio.CheerioAPI, settings: WahapediaSettings): void {
  const merged = { ...DEFAULT_WAHAPEDIA_SETTINGS, ...settings };

  // For each setting that is false (hide content), remove matching elements
  for (const [key, show] of Object.entries(merged)) {
    if (show) continue; // Don't remove if we want to show this content

    const selectors = WAHAPEDIA_CSS_SELECTORS[key as keyof WahapediaSettings];
    if (!selectors) continue;

    for (const selector of selectors) {
      $(selector).remove();
    }
  }
}

/**
 * Parse datasheets page to extract unit data from HTML content.
 */
export function parseDatasheets(
  content: string,
  sourceUrl: string,
  options: ParseOptions = {}
): ParsedUnit[] {
  return parseHtmlDatasheet(content, sourceUrl, options);
}

/**
 * Parse HTML datasheet using cheerio
 */
function parseHtmlDatasheet(
  html: string,
  sourceUrl: string,
  options: ParseOptions = {}
): ParsedUnit[] {
  const $ = cheerio.load(html);

  // Apply Wahapedia content filters (removes fluff, Legends, etc.)
  const settings = options.wahapediaSettings ?? DEFAULT_WAHAPEDIA_SETTINGS;
  applyWahapediaFilters($, settings);

  const units: ParsedUnit[] = [];

  // Extract unit name from title or h1
  let unitName = '';

  // Try page title first (format: "Faction – Unit Name" or "Faction - Unit Name")
  const titleText = $('title').text() || $('h1').first().text();
  const titleMatch = titleText.match(TITLE_UNIT_NAME);
  if (titleMatch && titleMatch[1]) {
    unitName = titleMatch[1].trim();
    // Remove any trailing "wahapedia" or similar
    unitName = unitName.replace(WAHAPEDIA_SUFFIX, '').trim();
  } else {
    // Try finding unit name from h1 or prominent header
    const h1Text = $('h1').first().text().trim();
    if (h1Text) {
      // Remove filter UI text that might be appended
      unitName = h1Text.replace(FILTER_UI_TEXT, '').trim();
      // Also try to extract from "Faction – Unit" format
      const h1Match = h1Text.match(TITLE_UNIT_NAME);
      if (h1Match && h1Match[1]) {
        unitName = h1Match[1].trim();
      }
    }
  }

  // Clean up common artifacts
  unitName = unitName
    .replace(PIPE_SUFFIX, '')
    .replace(BRACKET_SUFFIX, '')
    .trim();

  if (!unitName || unitName.length < 3) {
    return units;
  }

  // Extract stats
  const stats = parseUnitStatsFromHtml($);

  // Extract invulnerable save
  const invulnSave = extractInvulnerableSaveFromHtml($);
  if (invulnSave) stats.invulnerableSave = invulnSave;

  // Extract points cost
  const pointsCost = extractPointsCostFromHtml($);

  // Extract unit composition
  const unitComposition = extractUnitCompositionFromHtml($);

  // Extract leader info
  const leaderInfo = extractLeaderInfoFromHtml($);

  // Extract keywords to determine unit type
  const keywordsText = extractKeywordsFromHtml($);
  const isEpicHero = /epic\s*hero/i.test(keywordsText);
  const isBattleline = /battleline/i.test(keywordsText);
  const isDedicatedTransport = /dedicated\s*transport/i.test(keywordsText);

  // Extract base size
  const baseSize = extractBaseSizeFromHtml($);

  // Extract weapons
  const weapons = extractWeaponsFromHtml($, sourceUrl);

  // Extract abilities
  const abilities = extractAbilitiesFromHtml($, sourceUrl);

  const unit: Omit<NewUnit, 'factionId'> = {
    slug: slugify(unitName).slice(0, SLUG_MAX_LENGTH),
    name: unitName.slice(0, NAME_MAX_LENGTH),
    movement: stats.movement ?? null,
    toughness: stats.toughness ?? null,
    save: stats.save ?? null,
    invulnerableSave: stats.invulnerableSave ?? null,
    wounds: stats.wounds ?? null,
    leadership: stats.leadership ?? null,
    objectiveControl: stats.objectiveControl ?? null,
    pointsCost: pointsCost ?? null,
    baseSize,
    unitComposition,
    wargearOptions: null,
    leaderInfo,
    ledBy: null,
    transportCapacity: null,
    isEpicHero,
    isBattleline,
    isDedicatedTransport,
    legends: false,
    sourceUrl,
    dataSource: 'wahapedia' as const,
  };

  units.push({ unit, weapons, abilities });
  return units;
}

/**
 * Parse unit stats from HTML tables
 */
function parseUnitStatsFromHtml($: cheerio.CheerioAPI): UnitStats {
  const stats: UnitStats = {};

  // Look for stats table - typically has headers M, T, SV, W, LD, OC
  $('table').each((_, table) => {
    const $table = $(table);
    const headerText = $table.find('th').text().toUpperCase();

    // Check if this looks like a stats table
    if (headerText.includes('M') && headerText.includes('T') &&
        (headerText.includes('SV') || headerText.includes('SAVE')) &&
        headerText.includes('W')) {

      // Get the data row (usually the second row after headers)
      const dataRows = $table.find('tr').filter((_, row) => {
        const $row = $(row);
        // Data row should have td elements, not just th
        return $row.find('td').length > 0;
      });

      if (dataRows.length > 0) {
        const cells = $(dataRows[0]).find('td');
        if (cells.length >= 6) {
          const movement = $(cells[0]).text().trim();
          const toughness = $(cells[1]).text().trim();
          const save = $(cells[2]).text().trim();
          const wounds = $(cells[3]).text().trim();
          const leadership = $(cells[4]).text().trim();
          const oc = $(cells[5]).text().trim();

          if (movement) stats.movement = movement;
          if (toughness) stats.toughness = parseInt(toughness, 10) || undefined;
          if (save) stats.save = save;
          if (wounds) stats.wounds = parseInt(wounds, 10) || undefined;
          if (leadership) stats.leadership = parseInt(leadership, 10) || undefined;
          if (oc) stats.objectiveControl = parseInt(oc, 10) || undefined;
        }
      }
      return false; // Stop after finding stats table
    }
  });

  // Alternative: look for inline stats format in text
  if (!stats.toughness) {
    const bodyText = $('body').text();
    const statsMatch = bodyText.match(INLINE_STATS);
    if (statsMatch) {
      stats.movement = statsMatch[1] ?? undefined;
      stats.toughness = statsMatch[2] ? parseInt(statsMatch[2], 10) : undefined;
      stats.save = statsMatch[3] ?? undefined;
      stats.wounds = statsMatch[4] ? parseInt(statsMatch[4], 10) : undefined;
      stats.leadership = statsMatch[5] ? parseInt(statsMatch[5], 10) : undefined;
      stats.objectiveControl = statsMatch[6] ? parseInt(statsMatch[6], 10) : undefined;
    }
  }

  return stats;
}

/**
 * Extract invulnerable save from HTML
 */
function extractInvulnerableSaveFromHtml($: cheerio.CheerioAPI): string | null {
  const bodyText = $('body').text();

  // Priority 1: Look for the dedicated "INVULNERABLE SAVE" section header followed by value
  // This is the most reliable pattern for the unit's actual invulnerable save
  const invulnSectionMatch = bodyText.match(INVULN_SECTION_HEADER);
  if (invulnSectionMatch?.[1]) return invulnSectionMatch[1];

  // Priority 2: Look for invuln-specific elements with class markers
  const invulnEl = $('[class*="invuln"], [class*="invulnerable"]');
  if (invulnEl.length) {
    const value = invulnEl.text().match(/(\d+\+)/);
    if (value?.[1]) return value[1];
  }

  // Priority 3: Look for "has a X+ invulnerable save" pattern (common in ability text)
  // This is less reliable as it may be conditional
  const hasInvulnMatch = bodyText.match(INVULN_HAS_PATTERN);
  if (hasInvulnMatch?.[1]) return hasInvulnMatch[1];

  return null;
}

/**
 * Extract points cost from HTML
 */
function extractPointsCostFromHtml($: cheerio.CheerioAPI): number | null {
  // Look for points in a table: | 1 model | 65 |
  let pointsCost: number | null = null;

  $('table').each((_, table) => {
    const $table = $(table);
    const tableText = $table.text();

    // Check if this looks like a points table
    if (tableText.toLowerCase().includes('model') && /\d{2,}/.test(tableText)) {
      $table.find('tr').each((_, row) => {
        const cells = $(row).find('td');
        cells.each((_, cell) => {
          const text = $(cell).text().trim();
          // Look for standalone numbers that could be points (typically 50-500)
          const numMatch = text.match(STANDALONE_POINTS);
          if (numMatch?.[1] && !pointsCost) {
            const num = parseInt(numMatch[1], 10);
            if (isValidPointsCost(num)) {
              pointsCost = num;
            }
          }
        });
      });
    }
    if (pointsCost) return false;
  });

  // Fallback: search in text for table format
  if (!pointsCost) {
    const bodyText = $('body').text();
    const match = bodyText.match(TABLE_POINTS_FORMAT);
    if (match?.[1]) {
      pointsCost = parseInt(match[1], 10);
    }
  }

  return pointsCost;
}

/**
 * Extract unit composition from HTML
 */
function extractUnitCompositionFromHtml($: cheerio.CheerioAPI): string | null {
  // Look for "UNIT COMPOSITION" section
  let composition = '';

  // Search for text content after "UNIT COMPOSITION" heading
  $('b, strong, h2, h3, h4').each((_, el) => {
    const text = $(el).text().trim().toUpperCase();
    if (text.includes('UNIT COMPOSITION')) {
      // Get the next sibling content
      let content = '';
      let current = $(el).parent();

      // Try to get content from the same container
      const parentText = current.text();
      const idx = parentText.toUpperCase().indexOf('UNIT COMPOSITION');
      if (idx >= 0) {
        content = parentText.slice(idx + 'UNIT COMPOSITION'.length).trim();
        // Stop at next section header
        const stopIdx = content.search(/LEADER|KEYWORDS:|FACTION KEYWORDS:|STRATAGEMS|DETACHMENT/i);
        if (stopIdx > 0) {
          content = content.slice(0, stopIdx);
        }
      }

      if (content) {
        composition = content
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, SHORT_DESCRIPTION_MAX_LENGTH);
      }
      return false;
    }
  });

  // Clean up any remaining artifacts
  if (composition) {
    // Remove point cost artifacts
    composition = composition.replace(POINTS_ARTIFACT, '').trim();
    // Remove CP costs (indicates we've hit stratagem text)
    const cpMatch = composition.match(CP_COST_MARKER);
    if (cpMatch) {
      const cpIndex = composition.search(CP_COST_MARKER);
      if (cpIndex > 0) {
        composition = composition.slice(0, cpIndex).trim();
      }
    }
  }

  return composition || null;
}

/**
 * Extract leader info from HTML
 */
function extractLeaderInfoFromHtml($: cheerio.CheerioAPI): string | null {
  const bodyText = $('body').text();

  // Look for LEADER section with attachable units
  const leaderMatch = bodyText.match(LEADER_ATTACHMENT_INFO);

  if (leaderMatch?.[1]) {
    const unitsList = leaderMatch[1]
      .split(/[-•\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 2 && !s.includes('KEYWORDS'))
      .slice(0, MAX_LEADER_ATTACHMENTS)
      .join('\n• ');

    if (unitsList) {
      return `This model can be attached to:\n• ${unitsList}`;
    }
  }

  return null;
}

/**
 * Extract keywords from HTML
 */
function extractKeywordsFromHtml($: cheerio.CheerioAPI): string {
  const bodyText = $('body').text();
  const keywordsMatch = bodyText.match(KEYWORDS_SECTION);
  return keywordsMatch?.[1] || '';
}

/**
 * Extract base size from HTML
 */
function extractBaseSizeFromHtml($: cheerio.CheerioAPI): string | null {
  const bodyText = $('body').text();
  const match = bodyText.match(BASE_SIZE);
  return match?.[1] || null;
}

/**
 * Extract weapon name and abilities from a cell element.
 * Wahapedia embeds abilities as <span class="kwb2"> elements inside the weapon name cell.
 * The structure is: <span>Weapon Name <span class="kwb2"><span class="tt">ability</span></span></span>
 *
 * Also handles cases where abilities get concatenated into the weapon name text
 * (e.g., "Bellow of endless fury ignorescovertorrent").
 */
function extractWeaponNameAndAbilities($: cheerio.CheerioAPI, $cell: cheerio.Cheerio<cheerio.Element>): { name: string; abilities: string | null } {
  // Extract abilities from span.kwb2 elements (these contain keywords like "blast", "psychic", etc.)
  // Only get the top-level kwb2 spans (not nested ones) to avoid duplicates
  const abilities: string[] = [];
  $cell.find('span.kwb2').each((_, span) => {
    // Get the full text of this ability span (e.g., "ignores cover" or "psychic")
    const abilityText = $(span).text().trim().toLowerCase();
    if (abilityText && abilityText.length > 1) {
      // Format as [ABILITY]
      abilities.push(`[${abilityText.toUpperCase()}]`);
    }
  });

  // Clone the cell and remove ALL ability-related spans to get clean weapon name
  const $clone = $cell.clone();
  // Remove kwb2 spans and their contents (these are the ability keywords)
  $clone.find('span.kwb2').remove();
  // Also remove any remaining tt spans (tooltip text)
  $clone.find('span.tt').remove();

  let name = $clone.text().trim();

  // Clean up the name - remove extra whitespace
  name = name
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-–]\s*/, '')
    .trim();

  // Check if abilities got concatenated into the weapon name (common HTML parsing issue)
  // Use cleanWeaponName to extract any embedded abilities
  const { name: cleanedName, abilities: extractedAbilities } = cleanWeaponName(name);
  name = cleanedName;

  // Merge extracted abilities with span-extracted abilities
  if (extractedAbilities) {
    const extractedList = extractedAbilities.split(', ').filter(Boolean);
    abilities.push(...extractedList);
  }

  // Deduplicate abilities (case-insensitive)
  const seen = new Set<string>();
  const uniqueAbilities = abilities.filter(ability => {
    const normalized = ability.toUpperCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  return {
    name,
    abilities: uniqueAbilities.length > 0 ? uniqueAbilities.join(', ') : null,
  };
}

/**
 * Extract weapons from HTML tables
 */
function extractWeaponsFromHtml($: cheerio.CheerioAPI, sourceUrl: string): NewWeapon[] {
  const weapons: NewWeapon[] = [];
  const seenWeapons = new DeduplicationTracker();

  $('table').each((_, table) => {
    const $table = $(table);
    const headerText = $table.find('th').text().toUpperCase();
    const firstRowText = $table.find('tr').first().text().toUpperCase();
    const tableHeaderText = headerText + ' ' + firstRowText;

    // Skip non-weapon tables (Imperial Knights Deeds, points tables, etc.)
    const isDeedsTable = tableHeaderText.includes('DEED') ||
                         tableHeaderText.includes('D6') ||
                         tableHeaderText.includes('VOW');
    const isPointsTable = tableHeaderText.includes('MODELS') && tableHeaderText.includes('POINTS');

    if (isDeedsTable || isPointsTable) return;

    // Detect weapon table by looking for weapon-related headers
    const isRangedTable = tableHeaderText.includes('RANGE') ||
                          tableHeaderText.includes('BS') ||
                          tableHeaderText.includes('RANGED WEAPON');
    const isMeleeTable = tableHeaderText.includes('WS') ||
                         tableHeaderText.includes('MELEE WEAPON');

    if (!isRangedTable && !isMeleeTable) return;

    // Determine weapon type based on which skill column is present
    // Ranged weapons use BS (Ballistic Skill), Melee use WS (Weapon Skill)
    const weaponType: 'ranged' | 'melee' = isRangedTable && !isMeleeTable ? 'ranged' : 'melee';

    // Get all rows except header
    $table.find('tr').each((_, row) => {
      const $row = $(row);
      const cells = $row.find('td');

      // Skip rows without data cells or with too few cells
      if (cells.length < 6) return;

      // Skip header-like rows (check first cell text)
      const firstCellText = $(cells[0]).text().trim().toUpperCase();
      if (firstCellText === 'RANGED WEAPONS' || firstCellText === 'MELEE WEAPONS' ||
          firstCellText === 'WEAPON' || firstCellText === 'WEAPONS' ||
          firstCellText.includes('RANGE') || firstCellText.includes('---')) {
        return;
      }

      // Find the weapon name cell - usually the first non-empty cell, or second if first is empty icon cell
      let nameCellIdx = 0;
      while (nameCellIdx < cells.length && !$(cells[nameCellIdx]).text().trim()) {
        nameCellIdx++;
      }

      // Also check if this is an icon/marker cell (very short content)
      if ($(cells[nameCellIdx]).text().trim().length < 3 && cells.length > nameCellIdx + 1) {
        nameCellIdx++;
      }

      const $nameCell = $(cells[nameCellIdx]);
      const { name: weaponName, abilities: extractedAbilities } = extractWeaponNameAndAbilities($, $nameCell);

      if (!weaponName || weaponName.length < 2) return;

      // Skip weapon names that are too long (likely Deeds or other non-weapon text)
      if (weaponName.length > 100) return;

      // Skip header rows that might have slipped through
      const upperName = weaponName.toUpperCase();
      if (upperName === 'RANGED WEAPONS' || upperName === 'MELEE WEAPONS' ||
          upperName.includes('RANGED WEAPON') || upperName.includes('MELEE WEAPON') ||
          upperName === 'RANGE' || upperName === 'WEAPON' || upperName === 'WEAPONS' ||
          upperName.includes('DEED') || upperName.includes('VOW')) {
        return;
      }

      // Extract stat columns early to check for header rows
      const range = cells.length > nameCellIdx + 1 ? $(cells[nameCellIdx + 1]).text().trim() : null;
      const attacks = cells.length > nameCellIdx + 2 ? $(cells[nameCellIdx + 2]).text().trim() : null;

      // Skip if range/attacks columns contain header text (indicates this is a header row)
      const upperRange = range?.toUpperCase() ?? '';
      const upperAttacks = attacks?.toUpperCase() ?? '';
      if (upperRange === 'RANGE' || upperAttacks === 'A' || upperAttacks === 'ATTACKS') {
        return;
      }

      // Skip if we've already seen this weapon
      if (!seenWeapons.addIfNew(weaponName)) return;

      // Extract remaining stat columns (range and attacks already extracted above)
      // Standard order: Name, Range, A, BS/WS, S, AP, D
      const skill = cells.length > nameCellIdx + 3 ? $(cells[nameCellIdx + 3]).text().trim() : null;
      const strength = cells.length > nameCellIdx + 4 ? $(cells[nameCellIdx + 4]).text().trim() : null;
      const ap = cells.length > nameCellIdx + 5 ? $(cells[nameCellIdx + 5]).text().trim() : null;
      const damage = cells.length > nameCellIdx + 6 ? $(cells[nameCellIdx + 6]).text().trim() : null;

      // Override weapon type based on range - if range is "Melee", it's a melee weapon
      const actualWeaponType: 'ranged' | 'melee' = range?.toLowerCase() === 'melee' ? 'melee' : weaponType;

      weapons.push({
        slug: slugify(weaponName).slice(0, SLUG_MAX_LENGTH),
        name: weaponName.slice(0, NAME_MAX_LENGTH),
        weaponType: actualWeaponType,
        range: range || null,
        attacks: attacks || null,
        skill: skill || null,
        strength: strength || null,
        armorPenetration: ap || null,
        damage: damage || null,
        abilities: extractedAbilities,
        abilitiesJson: null,
        sourceUrl,
        dataSource: 'wahapedia' as const,
      });
    });
  });

  return weapons;
}

/**
 * Extract abilities from HTML
 */
function extractAbilitiesFromHtml($: cheerio.CheerioAPI, sourceUrl: string): Omit<NewAbility, 'factionId'>[] {
  const abilities: Omit<NewAbility, 'factionId'>[] = [];
  const seenAbilities = new DeduplicationTracker();

  // Look for CORE abilities (format: "CORE: Ability1, Ability2")
  $('b, strong').each((_, el) => {
    const text = $(el).text().trim();
    if (text.toUpperCase().startsWith('CORE:')) {
      const rawNames = text.replace(/^CORE:\s*/i, '');
      // Normalize the text first to fix concatenations like "DeadlyDemiseD6, DeepStrike"
      const normalizedNames = normalizeText(rawNames);
      const names = normalizedNames.split(',').map(s => s.trim());
      names.forEach(rawName => {
        const name = normalizeText(rawName);
        if (name && name.length >= 3 && seenAbilities.addIfNew(name)) {
          abilities.push({
            slug: slugify(name).slice(0, SLUG_MAX_LENGTH),
            name: name.slice(0, NAME_MAX_LENGTH),
            abilityType: 'core',
            description: 'CORE ability',
            sourceUrl,
            dataSource: 'wahapedia' as const,
          });
        }
      });
    }
  });

  // Look for FACTION abilities
  $('b, strong').each((_, el) => {
    const text = $(el).text().trim();
    if (text.toUpperCase().startsWith('FACTION:')) {
      const rawNames = text.replace(/^FACTION:\s*/i, '');
      // Normalize the text first to fix concatenations like "PactofBlood"
      const normalizedNames = normalizeText(rawNames);
      const names = normalizedNames.split(',').map(s => s.trim());
      names.forEach(rawName => {
        const name = normalizeText(rawName);
        if (name && name.length >= 3 && seenAbilities.addIfNew(name)) {
          abilities.push({
            slug: slugify(name).slice(0, SLUG_MAX_LENGTH),
            name: name.slice(0, NAME_MAX_LENGTH),
            abilityType: 'faction',
            description: 'FACTION ability',
            sourceUrl,
            dataSource: 'wahapedia' as const,
          });
        }
      });
    }
  });

  // Look for unit abilities with descriptions
  // Format: <b>Ability Name:</b> Description text
  // Skip patterns that are rules references, not unit abilities
  const skipAbilityPatterns = [
    /^(WHEN|TARGET|EFFECT|RESTRICTIONS|KEYWORDS):?$/i,
    /^hit roll/i,
    /^saving throw/i,
    /^wound roll/i,
    /^advance move/i,
    /^fall back move/i,
    /^normal move/i,
    /^desperate escape/i,
    /^engagement range/i,
    /^unmodified dice/i,
    /^feel no pain/i,
    /^benefit of cover/i,
    /^critical hit/i,
    /^critical wound/i,
    /^deadly demise/i,
    /^this model is equipped/i,
    /^every model is equipped/i,
    /^example/i,
    /^designer.?s note/i,
    /^stratagems?$/i,
    /^enhancements?$/i,
    /^detachment rule/i,
    /^army rule/i,
    /^invulnerable save$/i,
    /^unit composition$/i,
    /^wargear options?$/i,
    /^leader$/i,
    // Battle size rules - not unit abilities
    /^combat patrol$/i,
    /^incursion$/i,
    /^strike force$/i,
    /^onslaught$/i,
  ];

  $('b, strong').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();

    // Skip non-ability patterns
    if (!text.endsWith(':') && !text.includes(':')) return;
    if (text.toUpperCase().startsWith('CORE:') || text.toUpperCase().startsWith('FACTION:')) return;

    const name = text.replace(/:$/, '').trim();
    if (!name || name.length < 3 || name.length > 100) return;
    if (seenAbilities.has(name)) return;

    // Skip rules reference patterns
    for (const pattern of skipAbilityPatterns) {
      if (pattern.test(name)) return;
    }

    // Get description from following text
    const parent = $el.parent();
    const fullText = parent.text();
    const nameIdx = fullText.indexOf(text);
    if (nameIdx < 0) return;

    let description = fullText.slice(nameIdx + text.length).trim();

    // Clean up description
    description = description
      .replace(/^\s*:\s*/, '') // Remove leading colon
      .replace(/\s+/g, ' ')
      .trim();

    // Fix concatenated keywords from adjacent spans (e.g., "HERETIC ASTARTESHERETIC ASTARTES...")
    description = dedupeKeywords(description);
    description = description.slice(0, SHORT_DESCRIPTION_MAX_LENGTH);

    // Skip if description is too short or looks like garbage
    if (description.length < 10) return;
    if (/^\|[\s|]*$/.test(description)) return;
    if (description.split('](').length > 3) return; // URL list

    seenAbilities.add(name);
    abilities.push({
      slug: slugify(name).slice(0, SLUG_MAX_LENGTH),
      name: name.slice(0, NAME_MAX_LENGTH),
      abilityType: 'unit',
      description,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  });

  return abilities;
}

export const WEAPON_ABILITY_KEYWORDS = [
  'anti-',
  'assault',
  'blast',
  'devastating wounds',
  'devastatingwounds',
  'extra attacks',
  'hazardous',
  'heavy',
  'ignores cover',
  'ignorescover',
  'indirect fire',
  'indirectfire',
  'lance',
  'lethal hits',
  'lethalhits',
  'melta',
  'one shot',
  'oneshot',
  'pistol',
  'precision',
  'psychic',
  'rapid fire',
  'rapidfire',
  'sustained hits',
  'sustainedhits',
  'torrent',
  'twin-linked',
  'twinlinked',
];

// Weapon names that contain ability keywords but should NOT be split.
// These are legitimate compound weapon names, not concatenated abilities.
const WEAPON_NAME_BLOCKLIST = new Set([
  'autopistol',
  'bolt pistol',
  'plasma pistol',
  'hand flamer pistol',
  'stub pistol',
  'laspistol',
  'shuriken pistol',
  'neuro disruptor pistol',
  'needle pistol',
  'phosphor serpenta pistol',
  'multi-melta',
  'multimelta',
  'melta gun',
  'meltagun',
  'melta rifle',
  'melta destroyer',
  'inferno pistol', // has both melta effect and pistol in name
  'power lance',
  'hunting lance',
  'shock lance',
  'prioris lance',
]);

export function cleanWeaponName(rawName: string): { name: string; abilities: string | null } {
  let name = rawName;
  const foundAbilities: string[] = [];

  name = normalizeText(name);

  // Extract bracketed abilities like [BLAST], [PSYCHIC]
  let bracketMatch;
  // Create a new regex each time to reset lastIndex
  const bracketedPattern = new RegExp(BRACKETED_ABILITY.source, 'g');
  while ((bracketMatch = bracketedPattern.exec(name)) !== null) {
    foundAbilities.push(bracketMatch[0]);
  }
  name = name.replace(BRACKETED_ABILITY, '').trim();
  name = name.replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();

  const lowerName = name.toLowerCase();

  // Check if the entire weapon name is in the blocklist (don't split these)
  if (WEAPON_NAME_BLOCKLIST.has(lowerName)) {
    return {
      name: name.trim(),
      abilities: foundAbilities.length > 0 ? foundAbilities.join(', ') : null,
    };
  }

  for (const keyword of WEAPON_ABILITY_KEYWORDS) {
    const noSpaceKeyword = keyword.replace(/\s+/g, '');
    const idx = lowerName.indexOf(noSpaceKeyword);

    if (idx > 0) {
      const charBefore = name[idx - 1];
      const isConcatenated = charBefore !== ' ' && charBefore !== '-' && charBefore !== '–';

      if (!isConcatenated) {
        continue;
      }

      const before = name.slice(0, idx).trim();
      const after = name.slice(idx + noSpaceKeyword.length);

      // Check if the "before" portion would result in a blocklisted weapon name
      // This catches cases like "Autopistolpistol" where we'd split to "Autopistol" + [PISTOL]
      // but "Autopistol" is a valid weapon name that shouldn't have been concatenated
      const beforeLower = before.toLowerCase();
      if (WEAPON_NAME_BLOCKLIST.has(beforeLower)) {
        continue; // Skip this split - the "before" is a complete weapon name
      }

      const formattedAbility = `[${keyword.toUpperCase()}]`;
      foundAbilities.push(formattedAbility);

      name = before;

      if (after.length > 0) {
        const { name: afterName, abilities: afterAbilities } = cleanWeaponName(after);
        if (afterAbilities) {
          foundAbilities.push(...afterAbilities.split(', ').filter(Boolean));
        }
        if (afterName && afterName.length > 1 && !/^[a-z]/.test(afterName)) {
          name = `${name} ${afterName}`.trim();
        }
      }
      break;
    }
  }

  const uniqueAbilities = [...new Set(foundAbilities)];

  return {
    name: name.trim(),
    abilities: foundAbilities.length > 0 ? uniqueAbilities.join(', ') : null,
  };
}

export { ParsedUnit, UnitStats, ParseOptions };
