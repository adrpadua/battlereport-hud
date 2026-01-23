import * as cheerio from 'cheerio';
import type { NewUnit, NewWeapon, NewAbility } from '../../db/schema.js';

interface ParsedUnit {
  unit: Omit<NewUnit, 'factionId'>;
  weapons: NewWeapon[];
  abilities: Omit<NewAbility, 'factionId'>[];
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
 * Parse datasheets page to extract unit data.
 * Supports both HTML (preferred) and markdown (fallback) input.
 */
export function parseDatasheets(content: string, sourceUrl: string): ParsedUnit[] {
  // Detect if content is HTML (starts with < or contains doctype/html tags)
  const isHtml = content.trim().startsWith('<') ||
                 content.includes('<!DOCTYPE') ||
                 content.includes('<html') ||
                 content.includes('<body') ||
                 content.includes('<div');

  if (isHtml) {
    return parseHtmlDatasheet(content, sourceUrl);
  } else {
    // Fallback to markdown parsing for cached content
    return parseMarkdownDatasheet(content, sourceUrl);
  }
}

/**
 * Parse HTML datasheet using cheerio
 */
function parseHtmlDatasheet(html: string, sourceUrl: string): ParsedUnit[] {
  const $ = cheerio.load(html);
  const units: ParsedUnit[] = [];

  // Extract unit name from title or h1
  let unitName = '';

  // Try page title first (format: "Faction – Unit Name" or "Faction - Unit Name")
  const titleText = $('title').text() || $('h1').first().text();
  const titleMatch = titleText.match(/[–-]\s*([^[\\–-]+)/);
  if (titleMatch && titleMatch[1]) {
    unitName = titleMatch[1].trim();
    // Remove any trailing "wahapedia" or similar
    unitName = unitName.replace(/\s*[-–].*wahapedia.*/i, '').trim();
  } else {
    // Try finding unit name from h1 or prominent header
    const h1Text = $('h1').first().text().trim();
    if (h1Text) {
      // Remove filter UI text that might be appended
      unitName = h1Text.replace(/\s*\[?\s*No filter.*$/i, '').trim();
      // Also try to extract from "Faction – Unit" format
      const h1Match = h1Text.match(/[–-]\s*([^[\\–-]+)/);
      if (h1Match && h1Match[1]) {
        unitName = h1Match[1].trim();
      }
    }
  }

  // Clean up common artifacts
  unitName = unitName
    .replace(/\s*\|.*$/, '')  // Remove anything after pipe
    .replace(/\s*\[.*$/, '')  // Remove anything after bracket
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
    slug: slugify(unitName).slice(0, 255),
    name: unitName.slice(0, 255),
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
    const statsMatch = bodyText.match(/M\s+(\d+"?)\s+T\s+(\d+)\s+Sv\s+(\d+\+?)\s+W\s+(\d+)\s+Ld\s+(\d+\+?)\s+OC\s+(\d+)/);
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
  const invulnSectionMatch = bodyText.match(/INVULNERABLE SAVE[\s\n]*(\d+\+)/i);
  if (invulnSectionMatch?.[1]) return invulnSectionMatch[1];

  // Priority 2: Look for invuln-specific elements with class markers
  const invulnEl = $('[class*="invuln"], [class*="invulnerable"]');
  if (invulnEl.length) {
    const value = invulnEl.text().match(/(\d+\+)/);
    if (value?.[1]) return value[1];
  }

  // Priority 3: Look for "has a X+ invulnerable save" pattern (common in ability text)
  // This is less reliable as it may be conditional
  const hasInvulnMatch = bodyText.match(/has\s+a?\s*(\d+\+)\s*invulnerable save/i);
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
          const numMatch = text.match(/^(\d{2,3})$/);
          if (numMatch?.[1] && !pointsCost) {
            const num = parseInt(numMatch[1], 10);
            if (num >= 20 && num <= 500) {
              pointsCost = num;
            }
          }
        });
      });
    }
    if (pointsCost) return false;
  });

  // Fallback: search in text
  if (!pointsCost) {
    const bodyText = $('body').text();
    const match = bodyText.match(/\|\s*\d+\s*model[s]?\s*\|\s*(\d+)\s*\|/i);
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
          .slice(0, 1000);
      }
      return false;
    }
  });

  // Clean up any remaining artifacts
  if (composition) {
    // Remove point cost artifacts
    composition = composition.replace(/\d{3}\s+\d{3}/g, '').trim();
    // Remove CP costs
    if (composition.includes('1CP') || composition.includes('2CP')) {
      const cpIndex = composition.search(/\d+CP/);
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
  const leaderMatch = bodyText.match(
    /LEADER[\s\S]*?(?:can be attached to the following unit|can attach to)s?:\s*([\s\S]*?)(?=KEYWORDS:|FACTION KEYWORDS:|STRATAGEMS|DETACHMENT|$)/i
  );

  if (leaderMatch?.[1]) {
    const unitsList = leaderMatch[1]
      .split(/[-•\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 2 && !s.includes('KEYWORDS'))
      .slice(0, 10) // Limit to 10 units
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

  // Look for KEYWORDS section
  const keywordsMatch = bodyText.match(/KEYWORDS:?\s*([^\n]+)/i);
  return keywordsMatch?.[1] || '';
}

/**
 * Extract base size from HTML
 */
function extractBaseSizeFromHtml($: cheerio.CheerioAPI): string | null {
  const bodyText = $('body').text();
  const match = bodyText.match(/\(⌀(\d+mm(?:\s+oval)?)\)/);
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
  const seenWeapons = new Set<string>();

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
      const normalizedName = weaponName.toLowerCase().trim();
      if (seenWeapons.has(normalizedName)) return;
      seenWeapons.add(normalizedName);

      // Extract remaining stat columns (range and attacks already extracted above)
      // Standard order: Name, Range, A, BS/WS, S, AP, D
      const skill = cells.length > nameCellIdx + 3 ? $(cells[nameCellIdx + 3]).text().trim() : null;
      const strength = cells.length > nameCellIdx + 4 ? $(cells[nameCellIdx + 4]).text().trim() : null;
      const ap = cells.length > nameCellIdx + 5 ? $(cells[nameCellIdx + 5]).text().trim() : null;
      const damage = cells.length > nameCellIdx + 6 ? $(cells[nameCellIdx + 6]).text().trim() : null;

      // Override weapon type based on range - if range is "Melee", it's a melee weapon
      const actualWeaponType: 'ranged' | 'melee' = range?.toLowerCase() === 'melee' ? 'melee' : weaponType;

      weapons.push({
        slug: slugify(weaponName).slice(0, 255),
        name: weaponName.slice(0, 255),
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
  const seenAbilities = new Set<string>();

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
        if (name && name.length >= 3 && !seenAbilities.has(name.toLowerCase())) {
          seenAbilities.add(name.toLowerCase());
          abilities.push({
            slug: slugify(name).slice(0, 255),
            name: name.slice(0, 255),
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
        if (name && name.length >= 3 && !seenAbilities.has(name.toLowerCase())) {
          seenAbilities.add(name.toLowerCase());
          abilities.push({
            slug: slugify(name).slice(0, 255),
            name: name.slice(0, 255),
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
    if (seenAbilities.has(name.toLowerCase())) return;

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
    description = dedupeKeywordsInDescription(description);
    description = description.slice(0, 1000);

    // Skip if description is too short or looks like garbage
    if (description.length < 10) return;
    if (/^\|[\s|]*$/.test(description)) return;
    if (description.split('](').length > 3) return; // URL list

    seenAbilities.add(name.toLowerCase());
    abilities.push({
      slug: slugify(name).slice(0, 255),
      name: name.slice(0, 255),
      abilityType: 'unit',
      description,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  });

  return abilities;
}

// ============================================================================
// MARKDOWN FALLBACK PARSING (for cached content)
// ============================================================================

/**
 * Common concatenated patterns from Firecrawl markdown conversion.
 * Maps concatenated text to properly spaced text.
 */
const CONCATENATION_FIXES: Record<string, string> = {
  // Weapon ability combinations
  'blastpsychic': '[BLAST], [PSYCHIC]',
  'lethalhitspsychic': '[LETHAL HITS], [PSYCHIC]',
  'sustainedhitspsychic': '[SUSTAINED HITS], [PSYCHIC]',
  'devastatingwoundspsychic': '[DEVASTATING WOUNDS], [PSYCHIC]',
  'psychicblast': '[PSYCHIC], [BLAST]',
  'psychiclethalhits': '[PSYCHIC], [LETHAL HITS]',
  'psychicsustained': '[PSYCHIC], [SUSTAINED HITS]',
  'assaultblast': '[ASSAULT], [BLAST]',
  'heavyblast': '[HEAVY], [BLAST]',
  'rapidfireblast': '[RAPID FIRE], [BLAST]',
  'twinlinkedblast': '[TWIN-LINKED], [BLAST]',
  'meltahazardous': '[MELTA], [HAZARDOUS]',
  'torrentignorescover': '[TORRENT], [IGNORES COVER]',
  'ignorescovertorrent': '[IGNORES COVER], [TORRENT]',
  // Core abilities
  'feelnopain': 'Feel No Pain',
  'feelno pain': 'Feel No Pain',
  'fightsfirst': 'Fights First',
  'deepstrike': 'Deep Strike',
  'loneoperative': 'Lone Operative',
  'deadlydemise': 'Deadly Demise',
  'firingdeck': 'Firing Deck',
  // Faction abilities
  'pactofblood': 'Pact of Blood',
  'oathofmoment': 'Oath of Moment',
  'shadowinthewarp': 'Shadow in the Warp',
  'synapseshadow': 'Synapse, Shadow',
  'greatdevourer': 'Great Devourer',
  'fortheemperor': 'For the Emperor',
  'powerofthemachine': 'Power of the Machine Spirit',
  'codeofhonour': 'Code of Honour',
  'armyofrenown': 'Army of Renown',
  'blessingsofkhorne': 'Blessings of Khorne',
  'bloodforthebloodgod': 'Blood for the Blood God',
  // Game terms
  'mortalwounds': 'mortal wounds',
  'mortalwound': 'mortal wound',
  'invulnerablesave': 'invulnerable save',
  'battleshock': 'Battle-shock',
  'battleshocktest': 'Battle-shock test',
  'battle-shocktest': 'Battle-shock test',
  'commandpoints': 'Command points',
  'hitroll': 'Hit roll',
  'woundroll': 'Wound roll',
};

/**
 * Normalize text by fixing common concatenation issues from Firecrawl.
 */
function normalizeText(text: string): string {
  let result = text;

  for (const [concat, fixed] of Object.entries(CONCATENATION_FIXES)) {
    const regex = new RegExp(concat, 'gi');
    result = result.replace(regex, fixed);
  }

  result = result.replace(/([a-z])([A-Z])/g, '$1 $2');
  result = result.replace(/\b(in)(the)\b/gi, '$1 $2');
  result = result.replace(/\b(of)(the)\b/gi, '$1 $2');
  result = result.replace(/\b(to)(the)\b/gi, '$1 $2');
  result = result.replace(/\b(from)(the)\b/gi, '$1 $2');

  return result;
}

/**
 * Deduplicate repeated uppercase keywords in ability descriptions.
 * Handles cases where adjacent <span> elements get concatenated without spaces,
 * e.g., "HERETIC ASTARTESHERETIC ASTARTES..." -> "HERETIC ASTARTES"
 */
function dedupeKeywordsInDescription(text: string): string {
  // Pattern to find repeated uppercase phrases (2+ words) that got concatenated
  // Matches: "WORD1 WORD2WORD1 WORD2WORD1 WORD2..." where words are all uppercase
  const repeatedKeywordPattern = /\b([A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+)+)(\1)+/g;

  let result = text.replace(repeatedKeywordPattern, '$1');

  // Also fix cases where a single uppercase word is repeated: "KEYWORDKEYWORDKEYWORD"
  // This handles cases like "INFANTRYINFANTRYINFANTRY"
  const repeatedWordPattern = /\b([A-Z][A-Z'-]{2,})(\1){2,}/g;
  result = result.replace(repeatedWordPattern, '$1');

  return result;
}

/**
 * Fallback markdown parser for cached content
 */
function parseMarkdownDatasheet(markdown: string, sourceUrl: string): ParsedUnit[] {
  const units: ParsedUnit[] = [];

  // Try to parse as individual unit page first
  const individualUnit = parseIndividualMarkdownUnit(markdown, sourceUrl);
  if (individualUnit) {
    return [individualUnit];
  }

  // Fall back to multi-unit page format
  const sections = markdown.split(/^## /m).filter(Boolean);
  for (const section of sections) {
    const parsed = parseMarkdownUnitSection(section, sourceUrl);
    if (parsed) {
      units.push(parsed);
    }
  }

  return units;
}

function parseIndividualMarkdownUnit(markdown: string, sourceUrl: string): ParsedUnit | null {
  const headerMatch = markdown.match(/^# [^–]+–\s*([^\[\\]+)/m);
  if (!headerMatch) return null;

  const rawName = headerMatch[1]?.trim().replace(/\s+$/, '');
  if (!rawName || rawName.length < 3) return null;

  const statsMatch = markdown.match(/M\s+(\d+"?)\s+T\s+(\d+)\s+Sv\s+(\d+\+?)\s+W\s+(\d+)\s+Ld\s+(\d+\+?)\s+OC\s+(\d+)/);

  const stats: UnitStats = {};
  if (statsMatch) {
    stats.movement = statsMatch[1];
    stats.toughness = parseInt(statsMatch[2]!, 10);
    stats.save = statsMatch[3];
    stats.wounds = parseInt(statsMatch[4]!, 10);
    stats.leadership = parseInt(statsMatch[5]!, 10);
    stats.objectiveControl = parseInt(statsMatch[6]!, 10);
  }

  let invulnMatch = markdown.match(/(\d+\+)\s*invulnerable save/i);
  if (!invulnMatch) {
    invulnMatch = markdown.match(/INVULNERABLE SAVE\s*\n+\s*(\d+\+)/i);
  }
  if (invulnMatch) {
    stats.invulnerableSave = invulnMatch[1];
  }

  const pointsMatch = markdown.match(/\|\s*\d+\s*model[s]?\s*\|\s*(\d+)\s*\|/i);
  const pointsCost = pointsMatch ? parseInt(pointsMatch[1]!, 10) : undefined;

  const compositionMatch = markdown.match(
    /UNIT COMPOSITION[\s\S]*?\n([\s\S]*?)(?=\n\s*(?:LEADER|KEYWORDS:|FACTION KEYWORDS:|STRATAGEMS|DETACHMENT|## )|$)/i
  );
  let unitComposition: string | null = null;
  if (compositionMatch?.[1]) {
    unitComposition = compositionMatch[1]
      .replace(/\*\*/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\|\s*[-]+\s*\|/g, '')
      .replace(/\|[^|]*\|[^|]*\|/g, '')
      .replace(/\s*\|\s*/g, ' ')
      .replace(/---\s*\d+(\s+\d+)*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000);

    if (unitComposition.includes('1CP') || unitComposition.includes('2CP')) {
      const cpIndex = unitComposition.search(/\d+CP/);
      if (cpIndex > 0) {
        unitComposition = unitComposition.slice(0, cpIndex).trim();
      }
    }
  }

  const leaderMatch = markdown.match(
    /LEADER[\s\S]*?This model can be attached to the following units?:\s*([\s\S]*?)(?=\n\s*(?:KEYWORDS:|FACTION KEYWORDS:|STRATAGEMS|DETACHMENT|## )|$)/i
  );
  let leaderInfo: string | null = null;
  if (leaderMatch?.[1]) {
    const unitsList = leaderMatch[1]
      .replace(/\*\*/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .split(/[-•]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.includes('KEYWORDS'))
      .join('\n• ');

    if (unitsList) {
      leaderInfo = `This model can be attached to:\n• ${unitsList}`;
    }
  }

  const keywordsSection = markdown.match(/KEYWORDS:\s*([^\n]+)/i)?.[1] || '';
  const isEpicHero = /epic\s*hero/i.test(keywordsSection) || /epic\s*hero/i.test(markdown);
  const isBattleline = /battleline/i.test(markdown);
  const isDedicatedTransport = /dedicated\s*transport/i.test(markdown);

  const weapons = extractMarkdownWeapons(markdown, sourceUrl);
  const abilities = extractMarkdownAbilities(markdown, sourceUrl);

  const baseSizeMatch = markdown.match(/\(⌀(\d+mm(?:\s+oval)?)\)/);
  const baseSize = baseSizeMatch?.[1] || null;

  const unit: Omit<NewUnit, 'factionId'> = {
    slug: slugify(rawName).slice(0, 255),
    name: rawName.slice(0, 255),
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

  return { unit, weapons, abilities };
}

function parseMarkdownUnitSection(section: string, sourceUrl: string): ParsedUnit | null {
  const lines = section.split('\n');
  const name = lines[0]?.trim();

  if (!name || isHeaderSection(name)) {
    return null;
  }

  const content = lines.slice(1).join('\n');
  const stats = extractMarkdownStats(content);

  const hasStats = stats.toughness !== undefined || stats.wounds !== undefined || stats.save !== undefined;
  if (!hasStats) {
    return null;
  }

  const pointsMatch = content.match(/(\d+)\s*(?:pts?|points)/i);
  const pointsCost = pointsMatch ? parseInt(pointsMatch[1]!, 10) : undefined;

  const compositionMatch = content.match(
    /(?:Unit Composition|Composition)[:\s]*([\s\S]*?)(?=\n(?:Wargear|Weapons|Abilities|Leader|###)|$)/i
  );
  const unitComposition = compositionMatch?.[1]?.trim() || null;

  const wargearMatch = content.match(
    /(?:Wargear Options?)[:\s]*([\s\S]*?)(?=\n(?:Abilities|Leader|###)|$)/i
  );
  const wargearOptions = wargearMatch?.[1]?.trim() || null;

  const leaderMatch = content.match(
    /(?:Leader)[:\s]*([\s\S]*?)(?=\n(?:Abilities|###)|$)/i
  );
  const leaderInfo = leaderMatch?.[1]?.trim() || null;

  const ledByMatch = content.match(
    /(?:Led By|Can be led by)[:\s]*([\s\S]*?)(?=\n(?:###)|$)/i
  );
  const ledBy = ledByMatch?.[1]?.trim() || null;

  const transportMatch = content.match(
    /(?:Transport Capacity)[:\s]*([\s\S]*?)(?=\n(?:Abilities|###)|$)/i
  );
  const transportCapacity = transportMatch?.[1]?.trim() || null;

  const isEpicHero = /epic hero/i.test(content) || /\*epic hero\*/i.test(content);
  const isBattleline = /battleline/i.test(content);
  const isDedicatedTransport = /dedicated transport/i.test(content);
  const legends = /legends?/i.test(content);

  const weapons = extractMarkdownWeapons(content, sourceUrl);
  const abilities = extractMarkdownAbilities(content, sourceUrl);

  const unit: Omit<NewUnit, 'factionId'> = {
    slug: slugify(name).slice(0, 255),
    name: name.slice(0, 255),
    movement: stats.movement ?? null,
    toughness: stats.toughness ?? null,
    save: stats.save ?? null,
    invulnerableSave: stats.invulnerableSave ?? null,
    wounds: stats.wounds ?? null,
    leadership: stats.leadership ?? null,
    objectiveControl: stats.objectiveControl ?? null,
    pointsCost: pointsCost ?? null,
    unitComposition,
    wargearOptions,
    leaderInfo,
    ledBy,
    transportCapacity,
    isEpicHero,
    isBattleline,
    isDedicatedTransport,
    legends,
    sourceUrl,
    dataSource: 'wahapedia' as const,
  };

  return { unit, weapons, abilities };
}

function extractMarkdownStats(content: string): UnitStats {
  const stats: UnitStats = {};

  const tableMatch = content.match(
    /\|\s*(\d+"?)\s*\|\s*(\d+)\s*\|\s*(\d+\+?)\s*\|\s*(\d+)\s*\|\s*(\d+\+?)\s*\|\s*(\d+)\s*\|/
  );

  if (tableMatch) {
    stats.movement = tableMatch[1];
    stats.toughness = parseInt(tableMatch[2]!, 10);
    stats.save = tableMatch[3];
    stats.wounds = parseInt(tableMatch[4]!, 10);
    stats.leadership = parseInt(tableMatch[5]!, 10);
    stats.objectiveControl = parseInt(tableMatch[6]!, 10);
    return stats;
  }

  const movementMatch = content.match(/(?:M|Movement)[:\s]*(\d+")/i);
  if (movementMatch) stats.movement = movementMatch[1];

  const toughnessMatch = content.match(/(?:T|Toughness)[:\s]*(\d+)/i);
  if (toughnessMatch) stats.toughness = parseInt(toughnessMatch[1]!, 10);

  const saveMatch = content.match(/(?:SV|Save)[:\s]*(\d+\+)/i);
  if (saveMatch) stats.save = saveMatch[1];

  const woundsMatch = content.match(/(?:W|Wounds)[:\s]*(\d+)/i);
  if (woundsMatch) stats.wounds = parseInt(woundsMatch[1]!, 10);

  const leadershipMatch = content.match(/(?:LD|Leadership)[:\s]*(\d+\+?)/i);
  if (leadershipMatch) stats.leadership = parseInt(leadershipMatch[1]!, 10);

  const ocMatch = content.match(/(?:OC|Objective Control)[:\s]*(\d+)/i);
  if (ocMatch) stats.objectiveControl = parseInt(ocMatch[1]!, 10);

  const invulnMatch = content.match(/(?:Invulnerable Save|Invuln)[:\s]*(\d+\+)/i);
  if (invulnMatch) stats.invulnerableSave = invulnMatch[1];

  return stats;
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

  const bracketedPattern = /\[([A-Z][A-Z\s-]+)\]/g;
  let bracketMatch;
  while ((bracketMatch = bracketedPattern.exec(name)) !== null) {
    foundAbilities.push(bracketMatch[0]);
  }
  name = name.replace(bracketedPattern, '').trim();
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

function extractMarkdownWeapons(content: string, sourceUrl: string): NewWeapon[] {
  const weapons: NewWeapon[] = [];

  const rangedSection = content.match(
    /(?:Ranged Weapons?|RANGED WEAPONS?)[\s\S]*?\n([\s\S]*?)(?=(?:Melee|MELEE|Abilities|###)|$)/i
  );

  if (rangedSection?.[1]) {
    const parsed = parseMarkdownWeaponTable(rangedSection[1], 'ranged', sourceUrl);
    weapons.push(...parsed);
  }

  const meleeSection = content.match(
    /MELEE WEAPONS[\s\S]*?\n([\s\S]*?)(?=(?:\n\s*(?:ABILITIES|###|\*\*))|$)/i
  );

  if (meleeSection?.[1]) {
    const parsed = parseMarkdownWeaponTable(meleeSection[1], 'melee', sourceUrl);
    weapons.push(...parsed);
  }

  return weapons;
}

function parseMarkdownWeaponTable(
  tableContent: string,
  weaponType: 'ranged' | 'melee',
  sourceUrl: string
): NewWeapon[] {
  const weapons: NewWeapon[] = [];

  const lines = tableContent.split('\n');

  for (const line of lines) {
    const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);

    if (cells.length < 8) continue;
    if (cells[0] !== '') continue;

    const rawName = cells[1];
    const range = cells[2];
    const attacks = cells[3];
    const skill = cells[4];
    const strength = cells[5];
    const ap = cells[6];
    const damage = cells[7];

    if (!rawName) continue;
    const lowerName = rawName.toLowerCase().trim();
    // Skip header rows
    if (lowerName === 'ranged weapons' || lowerName === 'melee weapons' ||
        lowerName === 'weapon' || lowerName === 'weapons' ||
        lowerName === 'range' || rawName.includes('---')) {
      continue;
    }

    if (!range || !attacks) continue;

    const { name, abilities } = cleanWeaponName(rawName);

    weapons.push({
      slug: slugify(name).slice(0, 255),
      name: name.slice(0, 255),
      weaponType,
      range: range || null,
      attacks: attacks || null,
      skill: skill || null,
      strength: strength || null,
      armorPenetration: ap || null,
      damage: damage || null,
      abilities,
      abilitiesJson: null,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  }

  return weapons;
}

const ABILITIES_STOP_MARKERS = [
  'STRATAGEMS',
  'UNIT COMPOSITION',
  'KEYWORDS:',
  'FACTION KEYWORDS:',
  'Army List',
  'Core Rules',
  'Datasheets collated',
  'DETACHMENT RULE',
  'ENHANCEMENTS',
  '## ',
];

const SKIP_ABILITY_PATTERNS = [
  /^WHEN:?$/i,
  /^TARGET:?$/i,
  /^EFFECT:?$/i,
  /^RESTRICTIONS:?$/i,
  /^Example:?$/i,
  /^D6 RESULT/i,
  /^NUMBER OF D6/i,
  /^FATE DICE/i,
  /^Characters$/i,
  /^Battleline$/i,
  /^Dedicated Transports$/i,
  /^Fortifications$/i,
  /^Other$/i,
  /keyword is used/i,
  /Army List/i,
  /Datasheets/i,
  /^\d+$/,
  /^\+$/,
  /^and others\.\.\.$/i,
  // Battle size rules - not unit abilities
  /^Combat Patrol$/i,
  /^Incursion$/i,
  /^Strike Force$/i,
  /^Onslaught$/i,
];

function shouldSkipAbility(name: string, description: string): boolean {
  for (const pattern of SKIP_ABILITY_PATTERNS) {
    if (pattern.test(name)) return true;
  }

  if (name.length < 3 || name.length > 100) return true;

  if (description.includes('](https://wahapedia.ru') && description.split('](').length > 3) {
    return true;
  }

  if (/^\|[\s|]*$/.test(description) || /^\s*\|\s*\d+\s*\|/.test(description)) {
    return true;
  }

  return false;
}

function extractMarkdownAbilities(
  content: string,
  sourceUrl: string
): Omit<NewAbility, 'factionId'>[] {
  const abilities: Omit<NewAbility, 'factionId'>[] = [];

  const abilitiesSection = content.match(
    /(?:### Abilities|\*\*ABILITIES\*\*|ABILITIES)[\s\S]*?\n([\s\S]*?)(?=###|STRATAGEMS|DETACHMENT RULE|ENHANCEMENTS|Army List|Datasheets collated|$)/i
  );

  if (!abilitiesSection?.[1]) {
    return abilities;
  }

  let abilitiesContent = abilitiesSection[1];

  for (const marker of ABILITIES_STOP_MARKERS) {
    const markerIndex = abilitiesContent.indexOf(marker);
    if (markerIndex > 0) {
      abilitiesContent = abilitiesContent.slice(0, markerIndex);
    }
  }

  abilitiesContent = abilitiesContent.slice(0, 3000);

  const labeledAbilityPattern = /^(CORE|FACTION):\s*\*\*([^*]+)\*\*/gm;
  let labelMatch;
  while ((labelMatch = labeledAbilityPattern.exec(abilitiesContent)) !== null) {
    const abilityType = labelMatch[1]!.toLowerCase() as 'core' | 'faction';
    const rawName = labelMatch[2]?.trim();
    const name = rawName ? normalizeText(rawName) : '';
    if (name && name.length >= 3) {
      abilities.push({
        slug: slugify(name).slice(0, 255),
        name: name.slice(0, 255),
        abilityType,
        description: `${abilityType.toUpperCase()} ability`,
        sourceUrl,
        dataSource: 'wahapedia' as const,
      });
    }
  }

  const abilityPattern = /^\*\*([^*:]+):\*\*\s*([\s\S]*?)(?=\n\*\*[^*]+\*\*|\n\n|$)/gm;
  let match;

  while ((match = abilityPattern.exec(abilitiesContent)) !== null) {
    const rawName = match[1]?.trim();
    let rawDescription = match[2]?.trim();

    if (!rawName || !rawDescription) continue;

    const name = normalizeText(rawName);
    let description = normalizeText(rawDescription);

    description = description
      .replace(/\n\s*\|[\s\S]*$/, '')
      .replace(/\n\s*-{3,}[\s\S]*$/, '')
      .trim();

    if (shouldSkipAbility(name, description)) continue;
    if (description.length < 10) continue;

    abilities.push({
      slug: slugify(name).slice(0, 255),
      name: name.slice(0, 255),
      abilityType: 'unit',
      description,
      sourceUrl,
      dataSource: 'wahapedia' as const,
    });
  }

  return abilities;
}

function isHeaderSection(name: string): boolean {
  const lower = name.toLowerCase();

  if (name.startsWith('|') || name.length < 3) {
    return true;
  }

  return (
    lower.includes('datasheet') ||
    lower.includes('index') ||
    lower.includes('contents') ||
    lower.includes('navigation') ||
    lower === 'characters' ||
    lower === 'battleline' ||
    lower === 'other datasheets' ||
    lower === 'dedicated transports' ||
    lower === 'fortifications'
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export { ParsedUnit, UnitStats };
