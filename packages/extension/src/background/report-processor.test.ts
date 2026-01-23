/**
 * Tests for cleanEntityName function.
 *
 * Run with: npx tsx packages/extension/src/background/report-processor.test.ts
 */

import { cleanEntityName } from './report-processor';

// Test utilities
let passed = 0;
let failed = 0;

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${name}`);
  console.log('='.repeat(50));
  const result = fn();
  if (result instanceof Promise) {
    return result;
  }
}

function it(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err}`);
      failed++;
    }
  };
  return run();
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

// Tests
async function runTests() {
  await describe('cleanEntityName - strip AI type annotations', async () => {
    await it('removes "(unit)" suffix', () => {
      expect(cleanEntityName('Eightbound (unit)')).toBe('Eightbound');
      expect(cleanEntityName('Intercessor Squad (unit)')).toBe('Intercessor Squad');
    });

    await it('removes "(stratagem)" suffix', () => {
      expect(cleanEntityName('Armour of Contempt (stratagem)')).toBe('Armour of Contempt');
      expect(cleanEntityName('Insane Bravery (stratagem)')).toBe('Insane Bravery');
    });

    await it('removes "(enhancement)" suffix', () => {
      expect(cleanEntityName('Artificer Armour (enhancement)')).toBe('Artificer Armour');
      expect(cleanEntityName('The Honour Vehement (enhancement)')).toBe('The Honour Vehement');
    });

    await it('handles case variations', () => {
      expect(cleanEntityName('Eightbound (UNIT)')).toBe('Eightbound');
      expect(cleanEntityName('Eightbound (Unit)')).toBe('Eightbound');
      expect(cleanEntityName('Test (STRATAGEM)')).toBe('Test');
      expect(cleanEntityName('Test (Stratagem)')).toBe('Test');
      expect(cleanEntityName('Test (ENHANCEMENT)')).toBe('Test');
      expect(cleanEntityName('Test (Enhancement)')).toBe('Test');
    });

    await it('handles extra whitespace', () => {
      expect(cleanEntityName('Eightbound  (unit)')).toBe('Eightbound');
      expect(cleanEntityName('Eightbound (unit) ')).toBe('Eightbound');
      expect(cleanEntityName(' Eightbound (unit) ')).toBe('Eightbound');
    });
  });

  await describe('cleanEntityName - strip AI descriptive annotations', async () => {
    await it('removes model count annotations', () => {
      expect(cleanEntityName('Zoanthropes (6 model unit)')).toBe('Zoanthropes');
      expect(cleanEntityName('Hormagaunts (15)')).toBe('Hormagaunts');
      expect(cleanEntityName('Tactical Squad (10 models)')).toBe('Tactical Squad');
    });

    await it('removes unit numbering', () => {
      expect(cleanEntityName('Raveners (unit 1)')).toBe('Raveners');
      expect(cleanEntityName('Exalted Eightbound (unit 2)')).toBe('Exalted Eightbound');
      expect(cleanEntityName('Gargoyles (unit 2, deep strike)')).toBe('Gargoyles');
    });

    await it('removes context notes', () => {
      expect(cleanEntityName('Tyranid Warriors (proxied as Raveners)')).toBe('Tyranid Warriors');
      expect(cleanEntityName('Genestealers (mentioned as an idea)')).toBe('Genestealers');
    });

    await it('removes loadout/variant annotations', () => {
      expect(cleanEntityName('Achilles Ridgerunners (mortar)')).toBe('Achilles Ridgerunners');
      expect(cleanEntityName('Rhino (Transport)')).toBe('Rhino');
    });
  });

  await describe('cleanEntityName - preserve valid names without parentheses', async () => {
    await it('does NOT modify valid unit names', () => {
      expect(cleanEntityName('Eightbound')).toBe('Eightbound');
      expect(cleanEntityName('Exalted Eightbound')).toBe('Exalted Eightbound');
      expect(cleanEntityName('Khârn The Betrayer')).toBe('Khârn The Betrayer');
      expect(cleanEntityName('Intercessor Squad')).toBe('Intercessor Squad');
      expect(cleanEntityName('Primaris Intercessors')).toBe('Primaris Intercessors');
    });
  });

  await describe('cleanEntityName - edge cases', async () => {
    await it('handles empty string', () => {
      expect(cleanEntityName('')).toBe('');
    });

    await it('handles whitespace only', () => {
      expect(cleanEntityName('   ')).toBe('');
    });

    await it('only removes suffix, not middle occurrences', () => {
      expect(cleanEntityName('Some (unit) Thing')).toBe('Some (unit) Thing');
    });

    await it('handles names with special characters', () => {
      expect(cleanEntityName("T'au Commander (unit)")).toBe("T'au Commander");
      expect(cleanEntityName('Khârn The Betrayer (unit)')).toBe('Khârn The Betrayer');
    });
  });

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
