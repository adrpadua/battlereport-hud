---
sidebar_position: 5
---

# AI Extraction

After preprocessing identifies potential terms, AI extraction assigns them to players and builds a structured battle report.

## Extraction Pipeline

```text
┌─────────────────────────────────────────────────────────────┐
│                  Preprocessed Transcript                     │
│  • unitMentions: Map<name, timestamps[]>                    │
│  • stratagemMentions: Map<name, timestamps[]>               │
│  • normalizedSegments: [{taggedText, startTime}]            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PROMPT CONSTRUCTION                                         │
│  • Video metadata (title, description, chapters)            │
│  • Detected entities with timestamps                         │
│  • Tagged transcript excerpts                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  GPT-4o-mini                                                 │
│  • Player identification                                     │
│  • Unit assignment (which player owns each unit)            │
│  • Stratagem assignment                                      │
│  • Mission detection                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  VALIDATION & ENRICHMENT                                     │
│  • Match units against BSData                                │
│  • Add stats, keywords, abilities                            │
│  • Calculate confidence scores                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    GameExtraction Result                     │
└─────────────────────────────────────────────────────────────┘
```

## Prompt Construction

### System Prompt

```text
You are an expert at analyzing Warhammer 40,000 battle report videos.

Given the video metadata and detected game terms, your task is to:
1. Identify the two players and their factions
2. Assign detected units to the correct player
3. Identify which stratagems were used and by whom
4. Detect the mission being played

Use the tagged transcript to understand context. Terms are tagged as:
- [UNIT:Name] - Unit mentions
- [STRAT:Name] - Stratagem mentions
- [ENHANCEMENT:Name] - Enhancement mentions
```

### User Prompt Structure

```typescript
const userPrompt = `
## Video Information
Title: ${videoData.title}
Channel: ${videoData.channel}
Description: ${videoData.description.slice(0, 500)}

## Chapters
${videoData.chapters.map(c => `${c.startTime}s: ${c.title}`).join('\n')}

## Detected Factions
Player 1 Faction: ${factions[0]}
Player 2 Faction: ${factions[1]}

## Detected Units
${Array.from(unitMentions.entries())
  .map(([name, times]) => `- ${name} (mentioned at: ${times.join(', ')}s)`)
  .join('\n')}

## Detected Stratagems
${Array.from(stratagemMentions.entries())
  .map(([name, times]) => `- ${name} (mentioned at: ${times.join(', ')}s)`)
  .join('\n')}

## Tagged Transcript Excerpts
${normalizedSegments
  .filter(s => s.taggedText.includes('['))
  .slice(0, 50)
  .map(s => `[${s.startTime}s] ${s.taggedText}`)
  .join('\n')}

Please analyze this battle report and provide structured output.
`;
```

## Response Schema

The AI returns structured JSON:

```typescript
interface AIAssignmentResponse {
  players: PlayerAssignment[];
  unitAssignments: UnitAssignment[];
  stratagemAssignments: StratagemAssignment[];
  enhancementAssignments: EnhancementAssignment[];
  mission?: string;
  pointsLimit?: number;
}

interface PlayerAssignment {
  name: string;           // "John", "Player 1", etc.
  faction: string;        // "Space Marines"
  detachment: string;     // "Gladius Task Force"
  confidence: number;     // 0.0 - 1.0
}

interface UnitAssignment {
  name: string;           // "Intercessor Squad"
  playerIndex: number;    // 0 or 1
  confidence: number;
}

interface StratagemAssignment {
  name: string;           // "Armor of Contempt"
  playerIndex?: number;   // May be unknown
  confidence: number;
}

interface EnhancementAssignment {
  name: string;           // "Artificer Armour"
  playerIndex?: number;
  pointsCost?: number;
  confidence: number;
}
```

## Validation Against BSData

After AI extraction, units are validated against faction data:

```typescript
async function validateExtraction(
  extraction: AIAssignmentResponse,
  factionData: FactionData[]
): Promise<ValidatedExtraction> {
  const validatedUnits: ValidatedUnit[] = [];

  for (const assignment of extraction.unitAssignments) {
    const faction = factionData[assignment.playerIndex];

    // Fuse.js fuzzy search
    const fuse = new Fuse(faction.units, {
      keys: ['name'],
      threshold: 0.4
    });

    const results = fuse.search(assignment.name);

    if (results.length > 0 && results[0].score <= 0.4) {
      validatedUnits.push({
        originalName: assignment.name,
        matchedName: results[0].item.name,
        matchedUnit: results[0].item,
        confidence: 1 - results[0].score,
        isValidated: true,
        playerIndex: assignment.playerIndex
      });
    } else {
      // Try phonetic matching as fallback
      const phoneticMatch = findPhoneticMatch(
        assignment.name,
        faction.units.map(u => u.name)
      );

      validatedUnits.push({
        originalName: assignment.name,
        matchedName: phoneticMatch?.name || assignment.name,
        matchedUnit: phoneticMatch?.unit || null,
        confidence: phoneticMatch?.confidence || 0.3,
        isValidated: !!phoneticMatch,
        playerIndex: assignment.playerIndex
      });
    }
  }

  return { ...extraction, validatedUnits };
}
```

## GameExtraction Structure

The final extraction result:

```typescript
interface GameExtraction {
  // Player information
  players: PlayerInfo[];  // [{name, faction, factionId, detachment, confidence}]

  // Entity maps with timestamps
  units: Map<string, EntityMentions>;
  stratagems: Map<string, EntityMentions>;
  enhancements: Map<string, EntityMentions>;

  // AI assignments
  assignments: {
    units: Map<string, { playerIndex: number; confidence: number }>;
    stratagems: Map<string, { playerIndex?: number; confidence: number }>;
    enhancements: Map<string, { playerIndex?: number; pointsCost?: number; confidence: number }>;
  };

  // Preprocessed segments
  segments: NormalizedSegment[];

  // Additional detections
  factions: Map<string, number[]>;
  detachments: Map<string, number[]>;
  objectives: Map<string, number[]>;

  // Game info
  mission?: string;
  pointsLimit?: number;

  // Metadata
  videoId: string;
  extractedAt: number;
  processingTimeMs: number;
}

interface EntityMentions {
  canonicalName: string;
  timestamps: number[];
  mentionCount: number;
  isValidated: boolean;
  source: 'preprocessed' | 'ai';

  // For units
  stats?: UnitStats;
  keywords?: string[];
  pointsCost?: number;

  // Suggestion for unvalidated
  suggestedMatch?: {
    name: string;
    confidence: number;
    stats?: UnitStats;
  };
}
```

## LLM Preprocessing (Optional)

Before pattern matching, an optional LLM step can correct YouTube mishearings:

```typescript
async function preprocessWithLlm(
  transcript: TranscriptSegment[],
  factions: string[],
  apiKey: string
): Promise<Record<string, string>> {
  const prompt = `
You are helping to correct YouTube auto-caption errors for Warhammer 40K terminology.

Factions in this video: ${factions.join(', ')}

Here are transcript segments that may contain errors:
${transcript.slice(0, 100).map(s => s.text).join('\n')}

Return a JSON object mapping incorrect terms to correct ones:
{
  "neckron": "Necron",
  "intercesses": "Intercessors",
  ...
}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}
```

These mappings are cached per video and applied during preprocessing.

## Error Handling

### API Failures

```typescript
try {
  const response = await openai.chat.completions.create({...});
} catch (error) {
  if (error.status === 429) {
    // Rate limited - retry with backoff
    await sleep(1000);
    return retry();
  }
  if (error.status === 401) {
    // Invalid API key
    throw new Error('Invalid OpenAI API key');
  }
  // Other errors - return partial results
  return { partial: true, error: error.message };
}
```

### Invalid JSON Response

```typescript
function parseAIResponse(content: string): AIAssignmentResponse {
  try {
    const parsed = JSON.parse(content);

    // Validate required fields
    if (!Array.isArray(parsed.players)) {
      throw new Error('Missing players array');
    }
    if (!Array.isArray(parsed.unitAssignments)) {
      throw new Error('Missing unitAssignments array');
    }

    return parsed;
  } catch (error) {
    // Try to extract partial data
    console.error('Failed to parse AI response:', error);
    return {
      players: [],
      unitAssignments: [],
      stratagemAssignments: [],
      enhancementAssignments: []
    };
  }
}
```

## Stage Artifacts

Each extraction stage reports progress:

```typescript
interface StageArtifact {
  stage: number;          // 1-5
  name: PipelineStageName;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  summary: string;
  details?: Record<string, any>;
  error?: string;
}

type PipelineStageName =
  | 'load-faction-data'
  | 'llm-preprocessing'
  | 'pattern-preprocessing'
  | 'ai-assignment'
  | 'build-extraction';
```

Progress is reported via callback:

```typescript
await extractGame({
  videoId,
  transcript,
  factions,
  apiKey,
  onStageComplete: (artifact: StageArtifact) => {
    console.log(`Stage ${artifact.stage}: ${artifact.summary}`);
    // Update UI progress indicator
  }
});
```

## Cost Optimization

### Token Reduction

1. **Truncate description** - First 500 characters
2. **Sample transcript** - Only segments with detected terms
3. **Limit excerpts** - Max 50 tagged segments

### Caching

- LLM preprocessing cached per video (7-day TTL)
- Final extraction cached per video
- Avoids redundant API calls on re-analysis

### Model Selection

- **GPT-4o-mini** - Default, good balance of cost/quality
- **GPT-4o** - Available for complex videos (manual override)
