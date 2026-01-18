interface EntityMatch<T> {
  entity: T;
  start: number;
  end: number;
  matchedText: string;
}

interface Entity {
  name: string;
  type: string;
}

export function matchEntity<T extends Entity>(
  text: string,
  entities: T[]
): EntityMatch<T>[] {
  const matches: EntityMatch<T>[] = [];
  const lowerText = text.toLowerCase();

  for (const entity of entities) {
    const entityName = entity.name.toLowerCase();

    // Try exact match first
    let index = lowerText.indexOf(entityName);
    while (index !== -1) {
      // Check word boundaries
      const beforeChar = index > 0 ? lowerText[index - 1] : ' ';
      const afterChar =
        index + entityName.length < lowerText.length
          ? lowerText[index + entityName.length]
          : ' ';

      const isWordBoundary =
        isWordBoundaryChar(beforeChar) && isWordBoundaryChar(afterChar);

      if (isWordBoundary) {
        matches.push({
          entity,
          start: index,
          end: index + entityName.length,
          matchedText: text.slice(index, index + entityName.length),
        });
      }

      index = lowerText.indexOf(entityName, index + 1);
    }

    // Try fuzzy match for common abbreviations/variations
    const variations = getEntityVariations(entity.name);
    for (const variation of variations) {
      const varLower = variation.toLowerCase();
      let varIndex = lowerText.indexOf(varLower);

      while (varIndex !== -1) {
        const beforeChar = varIndex > 0 ? lowerText[varIndex - 1] : ' ';
        const afterChar =
          varIndex + varLower.length < lowerText.length
            ? lowerText[varIndex + varLower.length]
            : ' ';

        const isWordBoundary =
          isWordBoundaryChar(beforeChar) && isWordBoundaryChar(afterChar);

        // Don't add if we already have a match at this position
        const existingMatch = matches.find(
          (m) => m.start === varIndex && m.entity === entity
        );

        if (isWordBoundary && !existingMatch) {
          matches.push({
            entity,
            start: varIndex,
            end: varIndex + varLower.length,
            matchedText: text.slice(varIndex, varIndex + varLower.length),
          });
        }

        varIndex = lowerText.indexOf(varLower, varIndex + 1);
      }
    }
  }

  // Remove overlapping matches (keep longer ones)
  return removeOverlaps(matches);
}

function isWordBoundaryChar(char: string | undefined): boolean {
  if (!char) return true;
  return /[\s,.!?;:'"()\[\]{}]/.test(char);
}

function getEntityVariations(name: string): string[] {
  const variations: string[] = [];

  // Common Warhammer 40k abbreviations
  const abbreviations: Record<string, string[]> = {
    'Space Marines': ['SM', 'Astartes'],
    'Blood Angels': ['BA'],
    'Dark Angels': ['DA'],
    'Imperial Fists': ['IF'],
    'Ultramarines': ['UM'],
    'Space Wolves': ['SW'],
    'Black Templars': ['BT'],
    'Chaos Space Marines': ['CSM', 'Chaos Marines'],
    'Death Guard': ['DG'],
    'Thousand Sons': ['TS', '1KSons'],
    "World Eaters": ['WE'],
    'Adeptus Mechanicus': ['AdMech', 'Mechanicus'],
    'Adeptus Custodes': ['Custodes'],
    'Astra Militarum': ['Guard', 'IG', 'Imperial Guard'],
    'Adepta Sororitas': ['Sisters', 'SoB', 'Sisters of Battle'],
    'Grey Knights': ['GK'],
    'Imperial Knights': ['IK', 'Knights'],
    'Chaos Knights': ['CK'],
    'T\'au Empire': ['Tau', 'T\'au'],
    'Aeldari': ['Eldar', 'Craftworlds'],
    'Drukhari': ['Dark Eldar', 'DE'],
    'Genestealer Cults': ['GSC'],
    'Tyranids': ['Nids'],
    'Orks': ['Orkz'],
    'Necrons': ['Crons'],
    'Leagues of Votann': ['LoV', 'Votann', 'Squats'],
  };

  // Check if name matches any known abbreviation pattern
  for (const [fullName, abbrevs] of Object.entries(abbreviations)) {
    if (name.toLowerCase().includes(fullName.toLowerCase())) {
      variations.push(...abbrevs);
    }
  }

  // Handle plural/singular
  if (name.endsWith('s') && name.length > 3) {
    variations.push(name.slice(0, -1));
  } else if (!name.endsWith('s')) {
    variations.push(name + 's');
  }

  // Handle "the" prefix
  if (name.startsWith('The ')) {
    variations.push(name.slice(4));
  }

  return variations;
}

function removeOverlaps<T extends Entity>(
  matches: EntityMatch<T>[]
): EntityMatch<T>[] {
  if (matches.length === 0) return matches;

  // Sort by start position, then by length (longer first)
  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const result: EntityMatch<T>[] = [];
  let lastEnd = -1;

  for (const match of sorted) {
    if (match.start >= lastEnd) {
      result.push(match);
      lastEnd = match.end;
    }
  }

  return result;
}

export function fuzzyMatch(text: string, query: string): boolean {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Simple contains check
  if (textLower.includes(queryLower)) return true;

  // Check for word-level match
  const textWords = textLower.split(/\s+/);
  const queryWords = queryLower.split(/\s+/);

  return queryWords.every((qw) =>
    textWords.some((tw) => tw.startsWith(qw) || tw.includes(qw))
  );
}
