import { describe, it, expect } from 'vitest';
import {
  isMisclassifiedUnit,
  MISCLASSIFIED_UNIT_PATTERNS,
} from './extraction-service.js';

describe('isMisclassifiedUnit', () => {
  describe('should identify misclassified stratagems/abilities', () => {
    const misclassifiedNames = [
      'Endless Swarm (stratagem/ability reference)',
      'Resurgence (resurgent points / detachment resource)',
      'Cult Ambush (rule/ability)',
      'Return to the Shadows (stratagem / reserve ability)',
      'Drive-By Demolitions (ability/stratagem reference)',
      'Rapid Regeneration (ability reference)',
      'Some Ability (ability)',
      'Some Stratagem (stratagem)',
      'Reserve Move (reserve)',
      'Detachment Ability (detachment)',
      'Resource Token (resource)',
      'Something (reference)',
      'Cult Ambush token used',
    ];

    it.each(misclassifiedNames)('should filter out: %s', (name) => {
      expect(isMisclassifiedUnit(name)).toBe(true);
    });
  });

  describe('should NOT filter valid unit names', () => {
    const validUnitNames = [
      'Deathleaper',
      'Neurotyrant',
      'Tervigon',
      'Winged Hive Tyrant',
      'Hormagaunts',
      'Termagants',
      'Biovores',
      'Exocrine',
      'Lictor',
      'Maleceptor',
      'Neurolictor',
      'Trygon',
      'Zoanthropes',
      'Spore Mines',
      'Benefictus',
      'Kelermorph',
      'Nexos',
      'Primus',
      'Reductus Saboteur',
      'Acolyte Hybrids With Autopistols',
      'Acolyte Hybrids With Hand Flamers',
      'Neophyte Hybrids',
      'Achilles Ridgerunners (mortar)',
      'Achilles Ridgerunners (mining laser)',
      'Atalan Jackals',
      'Purestrain Genestealers',
      'Hybrid Metamorphs',
      // Names with parentheses that are NOT misclassified
      'Space Marines (Primaris)',
      'Tactical Squad (10 models)',
      'Rhino (Transport)',
    ];

    it.each(validUnitNames)('should NOT filter: %s', (name) => {
      expect(isMisclassifiedUnit(name)).toBe(false);
    });
  });

  describe('pattern coverage', () => {
    it('filters names containing "(stratagem"', () => {
      expect(isMisclassifiedUnit('Something (stratagem)')).toBe(true);
      expect(isMisclassifiedUnit('Something (Stratagem Reference)')).toBe(true);
    });

    it('filters names containing "(ability"', () => {
      expect(isMisclassifiedUnit('Something (ability)')).toBe(true);
      expect(isMisclassifiedUnit('Something (Ability Used)')).toBe(true);
    });

    it('filters names containing "(rule"', () => {
      expect(isMisclassifiedUnit('Cult Ambush (rule)')).toBe(true);
      expect(isMisclassifiedUnit('Core Rule (Rule Reference)')).toBe(true);
    });

    it('filters names containing "(reserve"', () => {
      expect(isMisclassifiedUnit('Deep Strike (reserve)')).toBe(true);
      expect(isMisclassifiedUnit('Strategic Reserve (Reserve Ability)')).toBe(true);
    });

    it('filters names containing "(detachment"', () => {
      expect(isMisclassifiedUnit('Gladius (detachment)')).toBe(true);
      expect(isMisclassifiedUnit('Detachment Rule (Detachment Ability)')).toBe(true);
    });

    it('filters names containing "(resource"', () => {
      expect(isMisclassifiedUnit('CP (resource)')).toBe(true);
      expect(isMisclassifiedUnit('Resurgent Points (Resource Pool)')).toBe(true);
    });

    it('filters names containing "(reference)"', () => {
      expect(isMisclassifiedUnit('Something (reference)')).toBe(true);
    });

    it('filters names with "stratagem / ability" pattern', () => {
      expect(isMisclassifiedUnit('Endless Swarm (stratagem / ability)')).toBe(true);
      expect(isMisclassifiedUnit('Something stratagem/ability')).toBe(true);
    });

    it('filters names with "ability / stratagem" pattern', () => {
      expect(isMisclassifiedUnit('Something ability / stratagem')).toBe(true);
      expect(isMisclassifiedUnit('Something ability/stratagem reference')).toBe(true);
    });

    it('filters names containing "resurgent points"', () => {
      expect(isMisclassifiedUnit('Resurgence (resurgent points used)')).toBe(true);
      expect(isMisclassifiedUnit('Used resurgent points to respawn')).toBe(true);
    });

    it('filters names containing "cult ambush.*token"', () => {
      expect(isMisclassifiedUnit('Cult Ambush token placed')).toBe(true);
      expect(isMisclassifiedUnit('Used Cult Ambush marker token')).toBe(true);
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase patterns', () => {
      expect(isMisclassifiedUnit('Something (STRATAGEM)')).toBe(true);
      expect(isMisclassifiedUnit('Something (ABILITY)')).toBe(true);
    });

    it('handles mixed case patterns', () => {
      expect(isMisclassifiedUnit('Something (Stratagem)')).toBe(true);
      expect(isMisclassifiedUnit('Something (Ability Reference)')).toBe(true);
    });
  });
});

describe('MISCLASSIFIED_UNIT_PATTERNS', () => {
  it('should be an array of RegExp patterns', () => {
    expect(Array.isArray(MISCLASSIFIED_UNIT_PATTERNS)).toBe(true);
    expect(MISCLASSIFIED_UNIT_PATTERNS.length).toBeGreaterThan(0);

    for (const pattern of MISCLASSIFIED_UNIT_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });

  it('all patterns should be case-insensitive', () => {
    for (const pattern of MISCLASSIFIED_UNIT_PATTERNS) {
      expect(pattern.flags).toContain('i');
    }
  });
});
