---
sidebar_position: 6
---

# Caching System

The extension uses a multi-layer caching system to minimize API calls and provide instant results for previously analyzed videos.

## Cache Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                      User Request                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: BATTLE REPORT CACHE                                │
│  IndexedDB: reports                                          │
│  Key: videoId                                                │
│  Value: Complete BattleReport                                │
│  TTL: 7 days                                                 │
│  ────────────────────────────────────────────────────────── │
│  HIT → Return immediately                                    │
│  MISS → Continue to extraction                               │
└─────────────────────────────────────────────────────────────┘
                              │ (cache miss)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: VIDEO DATA CACHE                                   │
│  IndexedDB: video-data                                       │
│  Key: videoId                                                │
│  Value: VideoData (transcript, chapters, etc.)              │
│  TTL: 7 days                                                 │
│  ────────────────────────────────────────────────────────── │
│  HIT → Skip transcript extraction                            │
│  MISS → Extract from YouTube DOM                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: LLM PREPROCESSING CACHE                            │
│  IndexedDB: llm-preprocess                                   │
│  Key: videoId                                                │
│  Value: {termMappings: Record<string, string>}              │
│  TTL: 7 days                                                 │
│  ────────────────────────────────────────────────────────── │
│  HIT → Apply cached term corrections                         │
│  MISS → Call LLM for preprocessing                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: MCP SERVER CACHE (Database)                        │
│  PostgreSQL: extraction_cache                                │
│  Key: videoId                                                │
│  Value: Full extraction result                               │
│  TTL: 7 days                                                 │
│  ────────────────────────────────────────────────────────── │
│  Server-side cache for API requests                          │
└─────────────────────────────────────────────────────────────┘
```

## IndexedDB Implementation

**File:** `packages/extension/src/background/cache-manager.ts`

### Database Schema

```typescript
interface CacheDB extends DBSchema {
  reports: {
    key: string;  // videoId
    value: {
      videoId: string;
      report: BattleReport;
      cachedAt: number;
    };
  };

  'video-data': {
    key: string;  // videoId
    value: {
      videoId: string;
      data: VideoData;
      cachedAt: number;
    };
  };

  'llm-preprocess': {
    key: string;  // videoId
    value: {
      videoId: string;
      result: LlmPreprocessResult;
      cachedAt: number;
    };
  };
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
```

### Core Functions

```typescript
// Battle Report Cache
export async function getCachedReport(
  videoId: string
): Promise<BattleReport | null> {
  const db = await openDatabase();
  const entry = await db.get('reports', videoId);

  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    await db.delete('reports', videoId);
    return null;
  }

  return entry.report;
}

export async function setCachedReport(
  videoId: string,
  report: BattleReport
): Promise<void> {
  const db = await openDatabase();
  await db.put('reports', {
    videoId,
    report,
    cachedAt: Date.now()
  });
}

export async function deleteCachedReport(
  videoId: string
): Promise<void> {
  const db = await openDatabase();
  await db.delete('reports', videoId);
}
```

### Video Data Cache

```typescript
export async function getCachedVideoData(
  videoId: string
): Promise<VideoData | null> {
  const db = await openDatabase();
  const entry = await db.get('video-data', videoId);

  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    await db.delete('video-data', videoId);
    return null;
  }

  return entry.data;
}

export async function setCachedVideoData(
  videoId: string,
  data: VideoData
): Promise<void> {
  const db = await openDatabase();
  await db.put('video-data', {
    videoId,
    data,
    cachedAt: Date.now()
  });
}
```

### LLM Preprocessing Cache

```typescript
export async function getCachedPreprocess(
  videoId: string
): Promise<LlmPreprocessResult | null> {
  const db = await openDatabase();
  const entry = await db.get('llm-preprocess', videoId);

  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    await db.delete('llm-preprocess', videoId);
    return null;
  }

  return entry.result;
}

export async function setCachedPreprocess(
  videoId: string,
  result: LlmPreprocessResult
): Promise<void> {
  const db = await openDatabase();
  await db.put('llm-preprocess', {
    videoId,
    result,
    cachedAt: Date.now()
  });
}
```

## Cache Cleanup

### Automatic Cleanup

```typescript
// Run on extension startup
export async function clearExpiredCache(): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();

  // Clean reports
  const reports = await db.getAll('reports');
  for (const entry of reports) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      await db.delete('reports', entry.videoId);
    }
  }

  // Clean video-data
  const videoData = await db.getAll('video-data');
  for (const entry of videoData) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      await db.delete('video-data', entry.videoId);
    }
  }

  // Clean llm-preprocess
  const llmCache = await db.getAll('llm-preprocess');
  for (const entry of llmCache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      await db.delete('llm-preprocess', entry.videoId);
    }
  }
}
```

### Periodic Cleanup

```typescript
// background/index.ts
chrome.alarms.create('cache-cleanup', {
  periodInMinutes: 24 * 60  // Once per day
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cache-cleanup') {
    clearExpiredCache();
  }
});
```

### Manual Cache Clear

```typescript
// Via message from content script
case 'CLEAR_CACHE': {
  const { videoId } = message.payload;
  await deleteCachedReport(videoId);
  await deleteCachedVideoData(videoId);
  await deleteCachedPreprocess(videoId);
  return { type: 'CLEAR_CACHE_RESULT', success: true };
}
```

## Server-Side Cache

**File:** `mcp-server/src/db/schema.ts`

### Extraction Cache Table

```typescript
export const extractionCache = pgTable('extraction_cache', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id', { length: 20 }).notNull().unique(),
  factions: jsonb('factions').notNull(),  // [faction1, faction2]
  report: jsonb('report').notNull(),       // Full BattleReport
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});
```

### AI Response Cache Table

```typescript
export const aiResponseCache = pgTable('ai_response_cache', {
  id: serial('id').primaryKey(),
  videoId: varchar('video_id', { length: 20 }).notNull(),
  factions: jsonb('factions').notNull(),
  rawResponse: text('raw_response').notNull(),  // Raw JSON from OpenAI
  promptHash: varchar('prompt_hash', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});
```

### Server Cache Operations

```typescript
// Check cache before extraction
async function getOrExtract(
  videoId: string,
  factions: [string, string]
): Promise<BattleReport> {
  // Check cache
  const cached = await db.query.extractionCache.findFirst({
    where: and(
      eq(extractionCache.videoId, videoId),
      gt(extractionCache.expiresAt, new Date())
    )
  });

  if (cached) {
    return cached.report as BattleReport;
  }

  // Extract and cache
  const report = await extractBattleReport(videoId, factions);

  await db.insert(extractionCache).values({
    videoId,
    factions,
    report,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }).onConflictDoUpdate({
    target: extractionCache.videoId,
    set: { report, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
  });

  return report;
}
```

## Cache Invalidation

### When to Invalidate

| Trigger | Action |
|---------|--------|
| User clicks "Refresh" | Clear all caches for videoId |
| 7 days elapsed | Automatic expiry |
| Extension update | Optional: clear all |
| Schema change | Manual migration needed |

### CLI Commands

```bash
# Clear cache for specific video
npm run cli mcp cache clear <videoId>

# Clear all expired caches
npm run cli mcp cache cleanup

# Clear all caches (nuclear option)
npm run cli mcp cache clear-all
```

## Cache Flow Diagram

```text
User visits YouTube video
         │
         ▼
┌─────────────────────┐
│ Check Report Cache  │
└─────────────────────┘
         │
    ┌────┴────┐
    │         │
  HIT       MISS
    │         │
    ▼         ▼
┌────────┐  ┌─────────────────────┐
│ Return │  │ Check VideoData     │
│ cached │  │ Cache               │
│ report │  └─────────────────────┘
└────────┘           │
              ┌──────┴──────┐
              │             │
            HIT           MISS
              │             │
              ▼             ▼
       ┌───────────┐  ┌───────────────┐
       │ Use cached│  │ Extract from  │
       │ video data│  │ YouTube DOM   │
       └───────────┘  └───────────────┘
              │             │
              └──────┬──────┘
                     │
                     ▼
         ┌─────────────────────┐
         │ Check LLM Preprocess│
         │ Cache               │
         └─────────────────────┘
                     │
              ┌──────┴──────┐
              │             │
            HIT           MISS
              │             │
              ▼             ▼
       ┌───────────┐  ┌───────────────┐
       │ Apply     │  │ Call LLM for  │
       │ cached    │  │ term mapping  │
       │ mappings  │  │ → Cache       │
       └───────────┘  └───────────────┘
              │             │
              └──────┬──────┘
                     │
                     ▼
         ┌─────────────────────┐
         │ Run extraction      │
         │ pipeline            │
         └─────────────────────┘
                     │
                     ▼
         ┌─────────────────────┐
         │ Cache result        │
         │ → Return to user    │
         └─────────────────────┘
```

## Performance Impact

### Cache Hit Rates (Typical)

| Cache Layer | Hit Rate | Time Saved |
|-------------|----------|------------|
| Battle Report | ~80% (revisits) | 5-15 seconds |
| Video Data | ~90% (same session) | 2-3 seconds |
| LLM Preprocessing | ~85% | 1-3 seconds + API cost |

### Storage Usage

| Cache | Typical Size | Max Size |
|-------|--------------|----------|
| Battle Report | 10-50 KB | 100 KB |
| Video Data | 20-100 KB | 500 KB |
| LLM Mappings | 1-5 KB | 20 KB |

Estimated total per video: ~50-150 KB

### Cleanup Thresholds

- Max age: 7 days
- Consider clearing if IndexedDB > 50 MB
- Chrome may auto-clear under storage pressure
