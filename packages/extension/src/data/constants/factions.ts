/**
 * Faction data constants for Warhammer 40K.
 * Includes all official faction names and common aliases.
 */

// All 40K Factions
export const FACTIONS = [
  'Adepta Sororitas',
  'Adeptus Custodes',
  'Adeptus Mechanicus',
  'Aeldari',
  'Agents of the Imperium',
  'Astra Militarum',
  'Black Templars',
  'Blood Angels',
  'Chaos Daemons',
  'Chaos Knights',
  'Chaos Space Marines',
  'Dark Angels',
  'Death Guard',
  'Deathwatch',
  'Drukhari',
  'Genestealer Cults',
  'Grey Knights',
  'Imperial Knights',
  'Leagues of Votann',
  'Necrons',
  'Orks',
  'Space Marines',
  'Space Wolves',
  "T'au Empire",
  'Thousand Sons',
  'Tyranids',
  'World Eaters',
] as const;

// Use proper capitalization matching official naming
export const FACTION_ALIASES = new Map<string, string>([
  ['eldar', 'Aeldari'],
  ['craftworlds', 'Aeldari'],
  ['craftworld', 'Aeldari'],
  ['dark eldar', 'Drukhari'],
  ['sisters of battle', 'Adepta Sororitas'],
  ['sisters', 'Adepta Sororitas'],
  ['admech', 'Adeptus Mechanicus'],
  ['ad mech', 'Adeptus Mechanicus'],
  ['custodes', 'Adeptus Custodes'],
  ['imperial guard', 'Astra Militarum'],
  ['guard', 'Astra Militarum'],
  ['tau', "T'au Empire"],
  ['tau empire', "T'au Empire"],
  ['gsc', 'Genestealer Cults'],
  ['genestealers', 'Genestealer Cults'],
  ['genestealer cult', 'Genestealer Cults'],
  ['csm', 'Chaos Space Marines'],
  ['death guard', 'Death Guard'],
  ['dg', 'Death Guard'],
  ['tsons', 'Thousand Sons'],
  ['nids', 'Tyranids'],
  ['votann', 'Leagues of Votann'],
]);

export type Faction = typeof FACTIONS[number];
