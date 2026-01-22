---
sidebar_position: 3
---

# Processing Pipeline

This document covers the complete data flow from YouTube video to HUD overlay.

## Pipeline Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           YouTube Video                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 1: VIDEO EXTRACTION                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Title     │  │ Description │  │  Chapters   │  │ Transcript  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 2: FACTION DETECTION                                              │
│  Scan title/description → Identify factions → User confirms selection   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 3: PREPROCESSING PIPELINE                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Exact     │→ │   Alias     │→ │   Fuzzy     │→ │  Phonetic   │    │
│  │  Matcher    │  │  Matcher    │  │  Matcher    │  │  Matcher    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 4: AI EXTRACTION                                                  │
│  GPT-4o-mini → Player assignment → Unit/stratagem categorization        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 5: VALIDATION                                                     │
│  Match against BSData → Enrich with stats → Calculate confidence        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 6: HUD RENDERING                                                  │
│  Cache results → Inject overlay → Display unit cards                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Stage 1: Video Extraction

**File:** `packages/extension/src/content/youtube-extractor.ts`

The extension extracts data directly from YouTube's DOM:

### Extracted Data

| Field | Source | Method |
|-------|--------|--------|
| Video ID | URL | Query param `v` |
| Title | DOM | Multiple selector fallbacks |
| Channel | DOM | Owner info element |
| Description | DOM | Expanded description text |
| Chapters | DOM/Description | Chapter markers or regex parsing |
| Transcript | DOM | YouTube transcript panel |
| Pinned Comment | DOM | First pinned comment |

### Transcript Extraction Process

1. Locate "Show transcript" button using multiple selectors
2. Click to open transcript panel
3. Wait for DOM to populate (~2 seconds)
4. Query `ytd-transcript-segment-renderer` elements
5. Parse timestamps (MM:SS → seconds)
6. Close panel to restore UI

### Data Structure

```typescript
interface VideoData {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  chapters: Chapter[];      // { title, startTime }
  transcript: TranscriptSegment[];  // { text, startTime, duration }
  pinnedComment: string | null;
}
```

## Stage 2: Faction Detection

**File:** `packages/extension/src/background/report-processor.ts`

### Detection Method

1. Scan video title, description, and pinned comment
2. Match against 25+ faction keyword patterns
3. Rank matches by confidence
4. Return top 10 detected factions
5. User selects 2 factions (one per player)

### Supported Factions

- Space Marines (and chapters: Blood Angels, Dark Angels, Space Wolves, etc.)
- Chaos factions (CSM, Death Guard, Thousand Sons, World Eaters)
- Xenos (Necrons, Tyranids, Orks, T'au, Aeldari, Drukhari)
- Imperial (Astra Militarum, Custodes, Sisters, AdMech, Knights)
- And more...

## Stage 3: Preprocessing Pipeline

**Files:**
- `packages/extension/src/background/preprocessing/pipeline.ts`
- `packages/extension/src/background/preprocessing/matchers/*.ts`

### Why Preprocessing?

YouTube's auto-generated captions frequently mishear Warhammer terminology:

| YouTube Caption | Actual Term |
|-----------------|-------------|
| "intercesses" | Intercessors |
| "necron warriors" | Necron Warriors |
| "melter" | Melta |
| "to ran its" | Tyranids |

The preprocessing pipeline corrects these errors before AI extraction.

### Three Modes

| Mode | Features | Use Case |
|------|----------|----------|
| `basic` | Pattern matching only | Fast, simple videos |
| `llm` | + LLM term corrections | Better accuracy |
| `full` | + Generated aliases | Best accuracy |

### Matcher Chain

Matchers run in priority order. First match wins:

```text
Priority 100: AliasMatcher
    ↓ (no match)
Priority 90: ExactMatcher
    ↓ (no match)
Priority 70: PhoneticMatcher (high confidence)
    ↓ (no match)
Priority 60: FuzzyMatcher
    ↓ (no match)
Priority 40: PhoneticMatcher (low confidence fallback)
```

#### 1. Alias Matcher (Priority 100)

Direct lookup of colloquial terms to official names.

```typescript
// Example aliases
"intercessors" → "Intercessor Squad"
"termies" → "Terminator Squad"
"devs" → "Devastator Squad"
```

**Confidence:** 1.0 (exact match)

#### 2. Exact Matcher (Priority 90)

Case-insensitive exact string matching against known unit names.

```typescript
match(term: string, candidates: string[]): MatchResult | null {
  const lower = term.toLowerCase().trim();
  const exactMatch = candidates.find(c => c.toLowerCase() === lower);
  if (exactMatch) {
    return { term, canonical: exactMatch, confidence: 1.0 };
  }
  return null;
}
```

**Confidence:** 1.0 (exact match)

#### 3. Phonetic Matcher (Priority 70/40)

Uses Double Metaphone algorithm to catch pronunciation-based errors.

```typescript
// Phonetic encoding examples
"Melta" → ["MLT", ""]
"Melter" → ["MLTR", ""]  // Same primary code prefix!

// YouTube mishearing corrected
"Melter" → "Melta" (phonetic match)
```

**Confidence:** 0.4-0.9 depending on match quality

#### 4. Fuzzy Matcher (Priority 60)

Sørensen-Dice coefficient on character bigrams for typo tolerance.

```typescript
calculateSimilarity(a: string, b: string): number {
  // Generate bigrams: "test" → ["te", "es", "st"]
  // Calculate overlap coefficient
  // Return 0-1 similarity score
}
```

**Confidence:** Based on similarity score (threshold: 0.4)

### Preprocessing Output

```typescript
interface PreprocessedTranscript {
  matches: TermMatch[];
  unitMentions: Map<string, number[]>;      // unit → [timestamps]
  stratagemMentions: Map<string, number[]>;
  objectiveMentions: Map<string, number[]>;
  enhancementMentions: Map<string, number[]>;
  normalizedSegments: NormalizedSegment[];
  colloquialToOfficial: Map<string, string>;
}

interface NormalizedSegment {
  originalText: string;
  normalizedText: string;  // Colloquial terms replaced
  taggedText: string;      // Terms tagged: [UNIT:Name]
  startTime: number;
  duration: number;
}
```

## Stage 4: AI Extraction

**File:** `packages/extension/src/background/preprocessing/pipeline.ts`

### Input to AI

The preprocessed transcript is sent to GPT-4o-mini with:

- Detected entities (units, stratagems, enhancements)
- Video metadata (title, description, chapters)
- Tagged transcript excerpts

### AI Tasks

1. **Player Identification** - Who is playing which faction?
2. **Unit Assignment** - Which units belong to which player?
3. **Stratagem Assignment** - Which stratagems were used by whom?
4. **Enhancement Assignment** - Character enhancements and points costs
5. **Mission Detection** - What mission is being played?

### Response Schema

```typescript
interface AIAssignmentResponse {
  players: [{
    name: string;
    faction: string;
    detachment: string;
    confidence: number;
  }];
  unitAssignments: [{
    name: string;
    playerIndex: number;
    confidence: number;
  }];
  stratagemAssignments: [{
    name: string;
    playerIndex?: number;
    confidence: number;
  }];
  enhancementAssignments: [{
    name: string;
    playerIndex?: number;
    pointsCost?: number;
    confidence: number;
  }];
  mission?: string;
  pointsLimit?: number;
}
```

## Stage 5: Validation

**File:** `packages/extension/src/utils/unit-validator.ts`

### Validation Process

1. **Fuse.js Fuzzy Match** - Search faction's unit list
2. **Phonetic Fallback** - If Fuse confidence is low
3. **Confidence Boosting** - If both methods agree
4. **BSData Enrichment** - Add stats, keywords, abilities

### Confidence Levels

| Level | Score | Meaning |
|-------|-------|---------|
| High | 0.7-1.0 | Exact or high-confidence match |
| Medium | 0.4-0.7 | Fuzzy match with reasonable similarity |
| Low | 0.0-0.4 | Weak match, may need manual review |

### Validation Status

| Status | Description |
|--------|-------------|
| Validated | Found in faction BSData, confidence ≥ 0.6 |
| Suggested | No exact match, but similar unit found |
| Unvalidated | No match found in faction |

## Stage 6: Caching & HUD Rendering

### Caching System

**File:** `packages/extension/src/background/cache-manager.ts`

Three IndexedDB stores with 7-day TTL:

| Store | Contents |
|-------|----------|
| `reports` | Final BattleReport objects |
| `llm-preprocess` | LLM term corrections |
| `video-data` | Extracted video metadata |

### Cache Flow

```text
Request → Check Cache
            ├─ Hit → Return cached data
            └─ Miss → Process → Cache → Return
```

### HUD Injection

**File:** `packages/extension/src/content/hud-injector.ts`

1. Find YouTube's secondary column (`#secondary-inner`)
2. Create Shadow DOM container (style isolation)
3. Mount React components
4. Display unit cards, stratagems, game state

### HUD Components

- **Player panels** - Faction, detachment, unit list
- **Unit cards** - Stats, keywords, abilities (on hover)
- **Stratagem list** - Used stratagems by phase
- **Progress indicators** - Pipeline stage status

## Complete Message Flow

```text
Content Script                    Service Worker
     │                                 │
     │─── GET_CACHED_REPORT ──────────→│
     │←── CACHE_HIT/MISS ─────────────│
     │                                 │
     │─── DETECT_FACTIONS ────────────→│
     │←── FACTIONS_DETECTED ──────────│
     │                                 │
     │    [User selects factions]      │
     │                                 │
     │─── EXTRACT_WITH_FACTIONS ──────→│
     │                                 │
     │    [Stage 1-5 processing]       │
     │←── STAGE_ARTIFACT (×5) ────────│
     │                                 │
     │←── EXTRACTION_RESULT ──────────│
     │                                 │
     │    [Display HUD]                │
```

## Key Files Reference

| Component | File | Key Functions |
|-----------|------|---------------|
| Video Extraction | `content/youtube-extractor.ts` | `extractVideoData()` |
| Faction Detection | `background/report-processor.ts` | `detectFactionFromText()` |
| Pipeline Orchestration | `preprocessing/pipeline.ts` | `extractGame()`, `preprocessTranscript()` |
| Exact Matcher | `matchers/exact-matcher.ts` | `match()` |
| Alias Matcher | `matchers/alias-matcher.ts` | `match()` |
| Fuzzy Matcher | `matchers/fuzzy-matcher.ts` | `calculateSimilarity()` |
| Phonetic Matcher | `matchers/phonetic-matcher.ts` | `match()` |
| Cache Manager | `background/cache-manager.ts` | `getCachedReport()`, `setCachedReport()` |
| Unit Validator | `utils/unit-validator.ts` | `validateUnit()` |
| HUD Injector | `content/hud-injector.ts` | `injectHud()` |
| Message Handler | `background/message-handlers.ts` | `processMessage()` |
