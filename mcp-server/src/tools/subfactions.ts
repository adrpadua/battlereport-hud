/**
 * Subfaction definitions for factions that have subfactions in Wahapedia.
 * Maps subfaction names (lowercase) to their parent faction slug and optional keyword.
 */

export interface SubfactionInfo {
  parentFaction: string;
  keyword?: string;
}

/**
 * Space Marine chapters - these are subfactions of Space Marines
 */
export const SPACE_MARINE_CHAPTERS: Record<string, SubfactionInfo> = {
  'blood angels': { parentFaction: 'space-marines', keyword: 'BLOOD ANGELS' },
  'dark angels': { parentFaction: 'space-marines', keyword: 'DARK ANGELS' },
  'space wolves': { parentFaction: 'space-marines', keyword: 'SPACE WOLVES' },
  'black templars': { parentFaction: 'space-marines', keyword: 'BLACK TEMPLARS' },
  'deathwatch': { parentFaction: 'space-marines', keyword: 'DEATHWATCH' },
  'ultramarines': { parentFaction: 'space-marines', keyword: 'ULTRAMARINES' },
  'imperial fists': { parentFaction: 'space-marines', keyword: 'IMPERIAL FISTS' },
  'white scars': { parentFaction: 'space-marines', keyword: 'WHITE SCARS' },
  'raven guard': { parentFaction: 'space-marines', keyword: 'RAVEN GUARD' },
  'salamanders': { parentFaction: 'space-marines', keyword: 'SALAMANDERS' },
  'iron hands': { parentFaction: 'space-marines', keyword: 'IRON HANDS' },
};

/**
 * Aeldari Craftworlds - these are subfactions of Aeldari
 */
export const AELDARI_CRAFTWORLDS: Record<string, SubfactionInfo> = {
  'ulthwe': { parentFaction: 'aeldari', keyword: 'ULTHWE' },
  'ulthwé': { parentFaction: 'aeldari', keyword: 'ULTHWE' },
  'saim-hann': { parentFaction: 'aeldari', keyword: 'SAIM-HANN' },
  'saim hann': { parentFaction: 'aeldari', keyword: 'SAIM-HANN' },
  'biel-tan': { parentFaction: 'aeldari', keyword: 'BIEL-TAN' },
  'biel tan': { parentFaction: 'aeldari', keyword: 'BIEL-TAN' },
  'iyanden': { parentFaction: 'aeldari', keyword: 'IYANDEN' },
  'alaitoc': { parentFaction: 'aeldari', keyword: 'ALAITOC' },
  'harlequins': { parentFaction: 'aeldari', keyword: 'HARLEQUINS' },
  'ynnari': { parentFaction: 'aeldari', keyword: 'YNNARI' },
};

/**
 * Chaos Daemon gods - these are subfactions of Chaos Daemons
 */
export const CHAOS_DAEMON_GODS: Record<string, SubfactionInfo> = {
  'khorne daemons': { parentFaction: 'chaos-daemons', keyword: 'KHORNE' },
  'daemons of khorne': { parentFaction: 'chaos-daemons', keyword: 'KHORNE' },
  'nurgle daemons': { parentFaction: 'chaos-daemons', keyword: 'NURGLE' },
  'daemons of nurgle': { parentFaction: 'chaos-daemons', keyword: 'NURGLE' },
  'tzeentch daemons': { parentFaction: 'chaos-daemons', keyword: 'TZEENTCH' },
  'daemons of tzeentch': { parentFaction: 'chaos-daemons', keyword: 'TZEENTCH' },
  'slaanesh daemons': { parentFaction: 'chaos-daemons', keyword: 'SLAANESH' },
  'daemons of slaanesh': { parentFaction: 'chaos-daemons', keyword: 'SLAANESH' },
};

/**
 * T'au Empire Septs - these are subfactions of T'au Empire
 */
export const TAU_SEPTS: Record<string, SubfactionInfo> = {
  "t'au sept": { parentFaction: 't-au-empire', keyword: "T'AU SEPT" },
  'tau sept': { parentFaction: 't-au-empire', keyword: "T'AU SEPT" },
  "vior'la": { parentFaction: 't-au-empire', keyword: "VIOR'LA" },
  'viorla': { parentFaction: 't-au-empire', keyword: "VIOR'LA" },
  "dal'yth": { parentFaction: 't-au-empire', keyword: "DAL'YTH" },
  'dalyth': { parentFaction: 't-au-empire', keyword: "DAL'YTH" },
  "sa'cea": { parentFaction: 't-au-empire', keyword: "SA'CEA" },
  'sacea': { parentFaction: 't-au-empire', keyword: "SA'CEA" },
  "farsight enclaves": { parentFaction: 't-au-empire', keyword: 'FARSIGHT ENCLAVES' },
  "bork'an": { parentFaction: 't-au-empire', keyword: "BORK'AN" },
  'borkan': { parentFaction: 't-au-empire', keyword: "BORK'AN" },
};

/**
 * Orks Clans - these are subfactions of Orks
 */
export const ORK_CLANS: Record<string, SubfactionInfo> = {
  'goffs': { parentFaction: 'orks', keyword: 'GOFF' },
  'goff': { parentFaction: 'orks', keyword: 'GOFF' },
  'bad moons': { parentFaction: 'orks', keyword: 'BAD MOONS' },
  'evil sunz': { parentFaction: 'orks', keyword: 'EVIL SUNZ' },
  'blood axes': { parentFaction: 'orks', keyword: 'BLOOD AXES' },
  'deathskulls': { parentFaction: 'orks', keyword: 'DEATHSKULLS' },
  'snakebites': { parentFaction: 'orks', keyword: 'SNAKEBITES' },
  'freebooterz': { parentFaction: 'orks', keyword: 'FREEBOOTERZ' },
};

/**
 * Necron Dynasties - these are subfactions of Necrons
 */
export const NECRON_DYNASTIES: Record<string, SubfactionInfo> = {
  'szarekhan': { parentFaction: 'necrons', keyword: 'SZAREKHAN' },
  'mephrit': { parentFaction: 'necrons', keyword: 'MEPHRIT' },
  'novokh': { parentFaction: 'necrons', keyword: 'NOVOKH' },
  'nephrekh': { parentFaction: 'necrons', keyword: 'NEPHREKH' },
  'nihilakh': { parentFaction: 'necrons', keyword: 'NIHILAKH' },
  'sautekh': { parentFaction: 'necrons', keyword: 'SAUTEKH' },
};

/**
 * Tyranid Hive Fleets - these are subfactions of Tyranids
 */
export const TYRANID_HIVE_FLEETS: Record<string, SubfactionInfo> = {
  'behemoth': { parentFaction: 'tyranids', keyword: 'BEHEMOTH' },
  'hive fleet behemoth': { parentFaction: 'tyranids', keyword: 'BEHEMOTH' },
  'kraken': { parentFaction: 'tyranids', keyword: 'KRAKEN' },
  'hive fleet kraken': { parentFaction: 'tyranids', keyword: 'KRAKEN' },
  'leviathan': { parentFaction: 'tyranids', keyword: 'LEVIATHAN' },
  'hive fleet leviathan': { parentFaction: 'tyranids', keyword: 'LEVIATHAN' },
  'hydra': { parentFaction: 'tyranids', keyword: 'HYDRA' },
  'hive fleet hydra': { parentFaction: 'tyranids', keyword: 'HYDRA' },
  'jormungandr': { parentFaction: 'tyranids', keyword: 'JORMUNGANDR' },
  'hive fleet jormungandr': { parentFaction: 'tyranids', keyword: 'JORMUNGANDR' },
  'kronos': { parentFaction: 'tyranids', keyword: 'KRONOS' },
  'hive fleet kronos': { parentFaction: 'tyranids', keyword: 'KRONOS' },
};

/**
 * Drukhari subfactions
 */
export const DRUKHARI_SUBFACTIONS: Record<string, SubfactionInfo> = {
  'kabal': { parentFaction: 'drukhari', keyword: 'KABAL' },
  'wych cult': { parentFaction: 'drukhari', keyword: 'WYCH CULT' },
  'haemonculus covens': { parentFaction: 'drukhari', keyword: 'HAEMONCULUS COVENS' },
  'covens': { parentFaction: 'drukhari', keyword: 'HAEMONCULUS COVENS' },
};

/**
 * Combined map of all subfactions to their parent factions.
 * Use this for general lookups.
 */
export const ALL_SUBFACTIONS: Record<string, SubfactionInfo> = {
  ...SPACE_MARINE_CHAPTERS,
  ...AELDARI_CRAFTWORLDS,
  ...CHAOS_DAEMON_GODS,
  ...TAU_SEPTS,
  ...ORK_CLANS,
  ...NECRON_DYNASTIES,
  ...TYRANID_HIVE_FLEETS,
  ...DRUKHARI_SUBFACTIONS,
};

/**
 * Check if a query matches any known subfaction.
 * @param query - The faction/subfaction name to check (case-insensitive)
 * @returns Subfaction info if found, null otherwise
 */
export function getSubfactionInfo(query: string): SubfactionInfo | null {
  const normalized = query.toLowerCase().trim();
  return ALL_SUBFACTIONS[normalized] ?? null;
}

/**
 * Check if a query matches a Space Marine chapter specifically.
 * @param query - The faction name to check (case-insensitive)
 * @returns Chapter info if found, null otherwise
 */
export function getChapterInfo(query: string): SubfactionInfo | null {
  const normalized = query.toLowerCase().trim();
  return SPACE_MARINE_CHAPTERS[normalized] ?? null;
}

/**
 * Get the parent faction slug for any subfaction name.
 * @param subfactionName - The subfaction name (case-insensitive)
 * @returns The parent faction slug (e.g., 'space-marines') or null if not a known subfaction
 */
export function getParentFactionSlug(subfactionName: string): string | null {
  const info = getSubfactionInfo(subfactionName);
  return info?.parentFaction ?? null;
}
