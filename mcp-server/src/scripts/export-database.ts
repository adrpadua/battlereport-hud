import 'dotenv/config';
import { getDb, closeConnection } from '../db/connection.js';
import * as schema from '../db/schema.js';
import { writeFileSync } from 'fs';

function escapeValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  // Escape single quotes
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function generateInsert(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const columns = Object.keys(rows[0]!);
  const lines: string[] = [];

  for (const row of rows) {
    const values = columns.map(col => escapeValue(row[col]));
    lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;`);
  }

  return lines.join('\n');
}

async function main() {
  const db = getDb();
  const output: string[] = [];

  output.push('-- WH40K Database Export');
  output.push(`-- Generated: ${new Date().toISOString()}`);
  output.push('');
  output.push('BEGIN;');
  output.push('');

  // Export factions
  console.log('Exporting factions...');
  const factions = await db.select().from(schema.factions);
  output.push('-- Factions');
  output.push(generateInsert('factions', factions));
  output.push('');

  // Export units
  console.log('Exporting units...');
  const units = await db.select().from(schema.units);
  output.push('-- Units');
  output.push(generateInsert('units', units));
  output.push('');

  // Export weapons
  console.log('Exporting weapons...');
  const weapons = await db.select().from(schema.weapons);
  output.push('-- Weapons');
  output.push(generateInsert('weapons', weapons));
  output.push('');

  // Export abilities
  console.log('Exporting abilities...');
  const abilities = await db.select().from(schema.abilities);
  output.push('-- Abilities');
  output.push(generateInsert('abilities', abilities));
  output.push('');

  // Export unit_weapons
  console.log('Exporting unit_weapons...');
  const unitWeapons = await db.select().from(schema.unitWeapons);
  output.push('-- Unit Weapons');
  output.push(generateInsert('unit_weapons', unitWeapons));
  output.push('');

  // Export unit_abilities
  console.log('Exporting unit_abilities...');
  const unitAbilities = await db.select().from(schema.unitAbilities);
  output.push('-- Unit Abilities');
  output.push(generateInsert('unit_abilities', unitAbilities));
  output.push('');

  // Export unit_index
  console.log('Exporting unit_index...');
  const unitIndex = await db.select().from(schema.unitIndex);
  output.push('-- Unit Index');
  output.push(generateInsert('unit_index', unitIndex));
  output.push('');

  output.push('COMMIT;');

  const filename = 'wahapedia_export.sql';
  writeFileSync(filename, output.join('\n'));

  console.log(`\nExport complete!`);
  console.log(`  Factions: ${factions.length}`);
  console.log(`  Units: ${units.length}`);
  console.log(`  Weapons: ${weapons.length}`);
  console.log(`  Abilities: ${abilities.length}`);
  console.log(`  Unit-Weapon links: ${unitWeapons.length}`);
  console.log(`  Unit-Ability links: ${unitAbilities.length}`);
  console.log(`  Unit Index: ${unitIndex.length}`);
  console.log(`\nSaved to: ${filename}`);

  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
