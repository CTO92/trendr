# Trendr - Technical Implementation Plan

## Overview

This document outlines the technical implementation for Trendr, a **local Windows desktop application** for tracking attention flow across social platforms. The application combines three analytical approaches:

1. **Audience Migration Tracker** - Tracking creator pivots and audience follows
2. **Semantic Flow Network** - Mapping topic co-occurrence and relationship evolution
3. **Motivation Layer Analysis** - Identifying underlying psychological drivers

**Target Platforms for Data:** YouTube, X (Twitter), Reddit

**Deployment:** Local Windows application (user's machine)

---

## Why Local-First?

| Benefit | Description |
|---------|-------------|
| **No hosting costs** | User runs on their own hardware |
| **Privacy** | All data stays on user's machine |
| **No API proxy needed** | User provides their own API keys |
| **Simpler architecture** | No auth, no multi-tenancy, no cloud ops |
| **Offline capable** | Analysis works without internet (after data collection) |
| **One-time purchase model** | No recurring SaaS fees for users |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TRENDR DESKTOP APP                              │
│                         (Electron + React)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐   │
│  │   YouTube   │  │   X/Twitter │  │   Reddit    │  │  Settings &  │   │
│  │  Collector  │  │  Collector  │  │  Collector  │  │  API Keys    │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────────┘   │
│         │                │                │                             │
│         └────────────────┼────────────────┘                             │
│                          ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    PROCESSING ENGINE                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                  │  │
│  │  │  Creator   │  │   Topic    │  │ Motivation │                  │  │
│  │  │ Processor  │  │ Processor  │  │ Processor  │                  │  │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                  │  │
│  │        └───────────────┼───────────────┘                         │  │
│  │                        ▼                                          │  │
│  │              ┌─────────────────┐                                  │  │
│  │              │  Flow Inference │                                  │  │
│  │              │     Engine      │                                  │  │
│  │              └────────┬────────┘                                  │  │
│  └───────────────────────┼──────────────────────────────────────────┘  │
│                          ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     LOCAL STORAGE                                 │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │  │
│  │  │   SQLite     │  │  JSON Files  │  │    Cache     │            │  │
│  │  │  (Primary)   │  │  (Exports)   │  │  (LevelDB)   │            │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                          │                                              │
│                          ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     DASHBOARD UI                                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │
│  │  │  Flows   │  │  Topics  │  │ Creators │  │  Alerts  │         │  │
│  │  │  Graph   │  │  Explorer│  │  Tracker │  │  Panel   │         │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │    Windows System Tray    │
                    │  (Background collection)  │
                    └───────────────────────────┘
```

---

## Technology Stack

### Desktop Framework
| Component | Technology | Rationale |
|-----------|------------|-----------|
| App Shell | **Electron** | Cross-platform, mature, good Windows support |
| Alternative | Tauri | Lighter weight, Rust-based (future option) |
| Frontend | React + TypeScript | Modern UI, component ecosystem |
| Build | electron-builder | Windows installer (.exe, .msi) |

### Local Processing
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js (bundled with Electron) | JavaScript everywhere |
| NLP | compromise.js + natural | Pure JS, no Python dependency |
| Alternative NLP | Local LLM (Ollama) | Optional for advanced classification |
| Task Scheduler | node-cron | Background collection jobs |

### Local Storage
| Purpose | Technology | Rationale |
|---------|------------|-----------|
| Primary Database | **SQLite** (better-sqlite3) | Fast, zero-config, single file |
| Graph Queries | SQL with recursive CTEs | No separate graph DB needed |
| Full-Text Search | SQLite FTS5 | Built-in, fast text search |
| Cache | LevelDB or flat files | Simple key-value for API responses |
| Exports | JSON/CSV files | User-accessible data |

### UI Components
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Charts | Recharts | React-native, good for time-series |
| Graph Viz | React Flow or vis.js | Interactive node-edge graphs |
| UI Kit | shadcn/ui + Tailwind | Modern, customizable components |
| State | Zustand | Lightweight, simple |

---

## Data Models

### SQLite Schema

```sql
-- Creators (tracked influencers)
CREATE TABLE creators (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,  -- 'youtube' | 'x' | 'reddit'
    platform_id TEXT NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    follower_count INTEGER,
    primary_topics TEXT,  -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, platform_id)
);

-- Topics (extracted subjects)
CREATE TABLE topics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    parent_topic_id TEXT REFERENCES topics(id),
    aliases TEXT,  -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Topic motivation scores
CREATE TABLE topic_motivations (
    topic_id TEXT REFERENCES topics(id),
    motivation TEXT NOT NULL,
    score REAL NOT NULL,  -- 0-1
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (topic_id, motivation)
);

-- Content (collected posts/videos)
CREATE TABLE content (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    platform_id TEXT NOT NULL,
    creator_id TEXT REFERENCES creators(id),
    content_type TEXT NOT NULL,  -- 'video' | 'post' | 'thread' | 'comment'
    text_content TEXT,
    engagement_likes INTEGER DEFAULT 0,
    engagement_comments INTEGER DEFAULT 0,
    engagement_shares INTEGER DEFAULT 0,
    engagement_views INTEGER,
    published_at DATETIME,
    collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, platform_id)
);

-- Content-topic associations
CREATE TABLE content_topics (
    content_id TEXT REFERENCES content(id),
    topic_id TEXT REFERENCES topics(id),
    confidence REAL NOT NULL,  -- 0-1
    PRIMARY KEY (content_id, topic_id)
);

-- Topic co-occurrences (edges in semantic graph)
CREATE TABLE topic_cooccurrences (
    topic_a_id TEXT REFERENCES topics(id),
    topic_b_id TEXT REFERENCES topics(id),
    frequency INTEGER DEFAULT 1,
    last_seen DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (topic_a_id, topic_b_id)
);

-- Detected flows
CREATE TABLE flows (
    id TEXT PRIMARY KEY,
    from_topic_id TEXT REFERENCES topics(id),
    to_topic_id TEXT REFERENCES topics(id),
    strength REAL NOT NULL,  -- 0-1
    confidence REAL NOT NULL,  -- 0-1
    signals TEXT,  -- JSON array of contributing signals
    motivation_link TEXT,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_until DATETIME
);

-- Creator topic history (for pivot detection)
CREATE TABLE creator_topic_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id TEXT REFERENCES creators(id),
    topic_id TEXT REFERENCES topics(id),
    content_count INTEGER DEFAULT 1,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL
);

-- User watchlist
CREATE TABLE watchlist (
    topic_id TEXT PRIMARY KEY REFERENCES topics(id),
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- Alerts
CREATE TABLE alerts (
    id TEXT PRIMARY KEY,
    alert_type TEXT NOT NULL,  -- 'flow_detected' | 'creator_pivot' | 'topic_surge'
    topic_id TEXT REFERENCES topics(id),
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API credentials (encrypted)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_content_platform ON content(platform, published_at);
CREATE INDEX idx_content_creator ON content(creator_id, published_at);
CREATE INDEX idx_cooccurrences_recent ON topic_cooccurrences(last_seen);
CREATE INDEX idx_flows_detected ON flows(detected_at);
CREATE INDEX idx_creator_history ON creator_topic_history(creator_id, period_start);

-- Full-text search
CREATE VIRTUAL TABLE content_fts USING fts5(text_content, content='content', content_rowid='rowid');
```

### Graph Queries with Recursive CTEs

```sql
-- Find all topics connected to a given topic (2 hops)
WITH RECURSIVE connected AS (
    SELECT topic_b_id AS topic_id, 1 AS depth, frequency
    FROM topic_cooccurrences
    WHERE topic_a_id = :start_topic

    UNION ALL

    SELECT tc.topic_b_id, c.depth + 1, tc.frequency
    FROM topic_cooccurrences tc
    JOIN connected c ON tc.topic_a_id = c.topic_id
    WHERE c.depth < 2
)
SELECT DISTINCT t.*, c.depth, c.frequency
FROM connected c
JOIN topics t ON t.id = c.topic_id
ORDER BY c.depth, c.frequency DESC;

-- Detect strengthening edges (emerging flows)
SELECT
    ta.name AS from_topic,
    tb.name AS to_topic,
    recent.freq AS recent_frequency,
    COALESCE(historical.freq, 0) AS historical_frequency,
    (recent.freq - COALESCE(historical.freq, 0)) * 1.0 /
        NULLIF(COALESCE(historical.freq, 1), 0) AS change_rate
FROM (
    SELECT topic_a_id, topic_b_id, SUM(frequency) AS freq
    FROM topic_cooccurrences
    WHERE last_seen > datetime('now', '-7 days')
    GROUP BY topic_a_id, topic_b_id
) recent
LEFT JOIN (
    SELECT topic_a_id, topic_b_id, SUM(frequency) AS freq
    FROM topic_cooccurrences
    WHERE last_seen BETWEEN datetime('now', '-30 days') AND datetime('now', '-7 days')
    GROUP BY topic_a_id, topic_b_id
) historical ON recent.topic_a_id = historical.topic_a_id
            AND recent.topic_b_id = historical.topic_b_id
JOIN topics ta ON ta.id = recent.topic_a_id
JOIN topics tb ON tb.id = recent.topic_b_id
WHERE (recent.freq - COALESCE(historical.freq, 0)) * 1.0 /
      NULLIF(COALESCE(historical.freq, 1), 0) > 0.5
ORDER BY change_rate DESC;
```

---

## Module Specifications

### Module 1: Data Collectors

Each collector runs as a background task, respecting API rate limits.

**YouTube Collector:**
```typescript
// Uses YouTube Data API v3
// User provides their own API key

interface YouTubeCollectorConfig {
  apiKey: string;
  channelIds: string[];  // Creators to track
  searchQueries: string[];  // Topics to monitor
  collectIntervalMinutes: number;
}

// Collection strategy:
// 1. Fetch latest videos from tracked channels
// 2. Search for videos matching topic queries
// 3. Collect comments on high-engagement videos
// 4. Store in SQLite, update creator profiles
```

**X/Twitter Collector:**
```typescript
// Uses X API v2
// User provides Bearer Token

interface XCollectorConfig {
  bearerToken: string;
  userIds: string[];  // Creators to track
  searchQueries: string[];  // Topics to monitor
  collectIntervalMinutes: number;
}

// Collection strategy:
// 1. Fetch recent tweets from tracked users
// 2. Search API for topic-related tweets
// 3. Collect engagement metrics
// 4. Store in SQLite
```

**Reddit Collector:**
```typescript
// Uses Reddit API (OAuth or API key)
// User provides credentials

interface RedditCollectorConfig {
  clientId: string;
  clientSecret: string;
  subreddits: string[];  // Communities to monitor
  searchQueries: string[];
  collectIntervalMinutes: number;
}

// Collection strategy:
// 1. Fetch hot/new posts from tracked subreddits
// 2. Search for posts matching queries
// 3. Collect comments on popular posts
// 4. Track crossposting patterns
```

**Rate Limit Handler:**
```typescript
class RateLimiter {
  private limits: Map<string, { remaining: number; resetAt: Date }>;

  async waitIfNeeded(platform: string): Promise<void> {
    const limit = this.limits.get(platform);
    if (limit && limit.remaining <= 1) {
      const waitMs = limit.resetAt.getTime() - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }
  }

  updateFromHeaders(platform: string, headers: Headers): void {
    // Parse rate limit headers and update state
  }
}
```

---

### Module 2: NLP Processing (Pure JavaScript)

Using lightweight JS libraries to avoid Python dependency:

```typescript
import nlp from 'compromise';
import { TfIdf, WordTokenizer } from 'natural';

class TopicExtractor {
  private topicTaxonomy: Map<string, string[]>;  // topic -> keywords

  extractTopics(text: string): ExtractedTopic[] {
    const doc = nlp(text);
    const topics: ExtractedTopic[] = [];

    // Extract named entities
    const people = doc.people().out('array');
    const places = doc.places().out('array');
    const orgs = doc.organizations().out('array');

    // Extract nouns and noun phrases
    const nouns = doc.nouns().out('array');
    const topics_raw = doc.topics().out('array');

    // Match against taxonomy
    for (const [topicId, keywords] of this.topicTaxonomy) {
      const matches = this.countMatches(text.toLowerCase(), keywords);
      if (matches > 0) {
        topics.push({
          topicId,
          confidence: Math.min(matches * 0.2, 1.0),
          mentions: matches
        });
      }
    }

    return topics.sort((a, b) => b.confidence - a.confidence);
  }

  private countMatches(text: string, keywords: string[]): number {
    return keywords.filter(kw => text.includes(kw.toLowerCase())).length;
  }
}

class MotivationClassifier {
  private patterns: Map<MotivationType, RegExp[]>;

  constructor() {
    this.patterns = new Map([
      ['wealth_accumulation', [
        /invest|profit|passive income|money|rich|wealth|roi|gains/i,
        /financial freedom|make money|side hustle|income stream/i
      ]],
      ['status_signaling', [
        /luxury|exclusive|rare|limited edition|premium|elite/i,
        /flex|show off|collection|authentic|genuine/i
      ]],
      ['community_belonging', [
        /community|together|we all|join us|tribe|fam|gang/i,
        /support each other|one of us|belong/i
      ]],
      ['identity_expression', [
        /who i am|my style|represents me|personal|authentic self/i,
        /express|identity|unique|individual/i
      ]],
      ['knowledge_expertise', [
        /learn|how to|guide|tutorial|explained|understand/i,
        /master|expert|deep dive|analysis/i
      ]],
      ['entertainment_escapism', [
        /fun|amazing|incredible|wow|crazy|wild/i,
        /enjoy|entertaining|hilarious|awesome/i
      ]],
      ['security_stability', [
        /safe|secure|protect|long.term|stable|reliable/i,
        /insurance|savings|peace of mind|risk.free/i
      ]]
    ]);
  }

  classify(text: string): MotivationScore[] {
    const scores: MotivationScore[] = [];

    for (const [motivation, patterns] of this.patterns) {
      let matchCount = 0;
      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) matchCount += matches.length;
      }

      if (matchCount > 0) {
        scores.push({
          motivation,
          score: Math.min(matchCount * 0.15, 1.0)
        });
      }
    }

    return scores.sort((a, b) => b.score - a.score);
  }
}
```

**Optional: Local LLM Integration (Ollama)**

For users who want better classification accuracy:

```typescript
class OllamaClassifier {
  private baseUrl = 'http://localhost:11434';

  async classifyTopic(text: string): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({
        model: 'mistral',  // or llama2, etc.
        prompt: `Extract the main topics from this text. Return as JSON array of topic names.\n\nText: ${text}\n\nTopics:`,
        stream: false
      })
    });

    const result = await response.json();
    return JSON.parse(result.response);
  }
}
```

---

### Module 3: Flow Inference Engine

```typescript
class FlowInferenceEngine {
  constructor(private db: Database) {}

  async detectFlows(): Promise<Flow[]> {
    const flows: Flow[] = [];

    // Signal 1: Creator pivots
    const creatorPivots = await this.detectCreatorPivots();

    // Signal 2: Strengthening co-occurrences
    const edgeChanges = await this.detectEdgeStrengthening();

    // Signal 3: Motivation matches
    const motivationLinks = await this.findMotivationBridges();

    // Merge signals into flow candidates
    const candidates = this.mergeSignals(creatorPivots, edgeChanges, motivationLinks);

    for (const candidate of candidates) {
      const confidence = this.calculateConfidence(candidate);

      if (confidence > 0.4) {  // Threshold
        flows.push({
          id: generateId(),
          fromTopicId: candidate.fromTopic,
          toTopicId: candidate.toTopic,
          strength: candidate.strength,
          confidence,
          signals: candidate.signals,
          motivationLink: candidate.sharedMotivation,
          detectedAt: new Date(),
          validUntil: addDays(new Date(), 30)
        });
      }
    }

    // Save to database
    await this.saveFlows(flows);

    // Generate alerts for significant flows
    await this.generateAlerts(flows);

    return flows;
  }

  private async detectCreatorPivots(): Promise<PivotSignal[]> {
    // Compare recent 30 days vs prior 90 days of creator content
    const sql = `
      WITH recent AS (
        SELECT creator_id, topic_id, COUNT(*) as cnt
        FROM creator_topic_history
        WHERE period_start > date('now', '-30 days')
        GROUP BY creator_id, topic_id
      ),
      historical AS (
        SELECT creator_id, topic_id, COUNT(*) as cnt
        FROM creator_topic_history
        WHERE period_start BETWEEN date('now', '-120 days') AND date('now', '-30 days')
        GROUP BY creator_id, topic_id
      )
      SELECT
        r.creator_id,
        r.topic_id as new_topic,
        h.topic_id as old_topic,
        r.cnt as new_count,
        COALESCE(h.cnt, 0) as old_count
      FROM recent r
      LEFT JOIN historical h ON r.creator_id = h.creator_id
      WHERE r.cnt > COALESCE(h.cnt, 0) * 1.5
        AND h.topic_id IS NOT NULL
        AND h.topic_id != r.topic_id
    `;

    return this.db.prepare(sql).all() as PivotSignal[];
  }

  private calculateConfidence(candidate: FlowCandidate): number {
    const weights = {
      creator_pivot: 0.4,
      co_occurrence: 0.35,
      motivation_match: 0.25
    };

    let score = 0;
    const signalTypes = new Set<string>();

    for (const signal of candidate.signals) {
      score += weights[signal.type] * signal.weight;
      signalTypes.add(signal.type);
    }

    // Multi-signal bonus
    if (signalTypes.size >= 2) score *= 1.2;
    if (signalTypes.size === 3) score *= 1.3;

    return Math.min(score, 1.0);
  }
}
```

---

### Module 4: Desktop UI (Electron + React)

**Main Window Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ☰  Trendr                                    ─  □  ×          │
├─────────┬───────────────────────────────────────────────────────┤
│         │                                                       │
│  📊     │   ┌─────────────────────────────────────────────┐    │
│  Flows  │   │                                             │    │
│         │   │         FLOW VISUALIZATION                  │    │
│  📁     │   │         (Interactive Graph)                 │    │
│  Topics │   │                                             │    │
│         │   │    [Topic A] ──────▶ [Topic B]             │    │
│  👤     │   │         ╲                                   │    │
│ Creators│   │          ╲──────▶ [Topic C]                │    │
│         │   │                                             │    │
│  🔔     │   └─────────────────────────────────────────────┘    │
│  Alerts │                                                       │
│         │   ┌──────────────┐  ┌──────────────┐                 │
│  ⚙️     │   │ Active Flows │  │ Top Creators │                 │
│ Settings│   │ • Crypto→NFT │  │ Moving Topics│                 │
│         │   │ • AI→Agents  │  │              │                 │
│         │   └──────────────┘  └──────────────┘                 │
│         │                                                       │
└─────────┴───────────────────────────────────────────────────────┘
```

**Key Screens:**

1. **Flow Dashboard**
   - Interactive force-directed graph of topics and flows
   - Filter by time range, confidence, topic category
   - Click flow to see evidence (sample content)

2. **Topic Explorer**
   - Search/browse all tracked topics
   - Topic detail: trend chart, motivation profile, related topics
   - Add to watchlist

3. **Creator Tracker**
   - List of tracked creators across platforms
   - Pivot timeline visualization
   - Add/remove creators to track

4. **Alerts Panel**
   - Chronological list of detected events
   - Mark as read, filter by type
   - Click to navigate to relevant topic/flow

5. **Settings**
   - API key configuration (with test buttons)
   - Collection schedule settings
   - Data management (export, clear, backup)
   - Topic taxonomy customization

---

### Module 5: Background Collection Service

```typescript
// Runs in Electron main process
class BackgroundCollector {
  private scheduler: CronJob;
  private isCollecting = false;

  start() {
    // Run collection every 30 minutes
    this.scheduler = new CronJob('*/30 * * * *', async () => {
      if (this.isCollecting) return;

      this.isCollecting = true;
      try {
        await this.runCollection();
      } finally {
        this.isCollecting = false;
      }
    });

    this.scheduler.start();
  }

  private async runCollection() {
    const settings = await getSettings();

    // Collect from each configured platform
    if (settings.youtube?.apiKey) {
      await this.collectYouTube(settings.youtube);
    }

    if (settings.twitter?.bearerToken) {
      await this.collectTwitter(settings.twitter);
    }

    if (settings.reddit?.clientId) {
      await this.collectReddit(settings.reddit);
    }

    // Process collected data
    await this.processContent();

    // Run flow detection
    await this.detectFlows();

    // Update system tray with status
    this.updateTrayIcon('idle');
  }
}
```

**System Tray Integration:**

```typescript
// Minimize to tray, show collection status
const tray = new Tray(iconPath);
tray.setContextMenu(Menu.buildFromTemplate([
  { label: 'Open Trendr', click: () => mainWindow.show() },
  { label: 'Collect Now', click: () => collector.runNow() },
  { type: 'separator' },
  { label: 'Last Collection: 10 min ago', enabled: false },
  { label: 'Next Collection: in 20 min', enabled: false },
  { type: 'separator' },
  { label: 'Quit', click: () => app.quit() }
]));
```

---

## Project Structure

```
trendr/
├── package.json
├── electron-builder.json          # Build config for Windows installer
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts              # App entry point
│   │   ├── background.ts         # Background collection service
│   │   ├── database.ts           # SQLite connection
│   │   ├── ipc-handlers.ts       # IPC communication
│   │   └── tray.ts               # System tray
│   │
│   ├── renderer/                  # React UI (renderer process)
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Topics.tsx
│   │   │   ├── Creators.tsx
│   │   │   ├── Alerts.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   │   ├── FlowGraph.tsx
│   │   │   ├── TopicCard.tsx
│   │   │   ├── CreatorList.tsx
│   │   │   ├── TrendChart.tsx
│   │   │   └── MotivationRadar.tsx
│   │   └── styles/
│   │
│   ├── shared/                    # Shared types and utilities
│   │   ├── types.ts
│   │   └── constants.ts
│   │
│   └── core/                      # Business logic (used by main process)
│       ├── collectors/
│       │   ├── youtube.ts
│       │   ├── twitter.ts
│       │   └── reddit.ts
│       ├── processors/
│       │   ├── topic-extractor.ts
│       │   ├── motivation-classifier.ts
│       │   └── creator-tracker.ts
│       ├── engine/
│       │   └── flow-inference.ts
│       └── nlp/
│           ├── tokenizer.ts
│           └── taxonomy.ts
│
├── assets/
│   ├── icons/                     # App icons
│   └── taxonomy/                  # Default topic taxonomy JSON
│
├── prisma/                        # Optional: Prisma for SQLite
│   └── schema.prisma
│
└── scripts/
    ├── build.ts                   # Build script
    └── package.ts                 # Package for Windows
```

---

## Implementation Phases

### Phase 1: Foundation
**Goal:** Working app shell with Reddit collection

**Deliverables:**
- Electron app with basic React UI
- SQLite database setup
- Reddit collector (user provides API key)
- Basic topic extraction (keyword matching)
- Simple topic list view
- Settings page for API key entry

**Success Criteria:**
- App installs and runs on Windows
- Can configure Reddit API and collect posts
- Topics extracted and displayed in list

---

### Phase 2: Full Collection
**Goal:** All three platforms, improved processing

**Deliverables:**
- YouTube collector
- X/Twitter collector
- Improved NLP (compromise.js integration)
- Co-occurrence tracking
- Creator tracking and pivot detection
- Flow dashboard with basic graph

**Success Criteria:**
- All three platform collectors working
- Co-occurrences tracked in database
- Creator pivots detected

---

### Phase 3: Flow Detection
**Goal:** Full flow inference, motivation analysis

**Deliverables:**
- Motivation classifier
- Multi-signal flow detection
- Confidence scoring
- Interactive flow graph visualization
- Alert system
- Watchlist functionality

**Success Criteria:**
- Flows detected with confidence scores
- Alerts generated for significant events
- Graph visualization interactive and useful

---

### Phase 4: Polish & Distribution
**Goal:** Production-ready application

**Deliverables:**
- Windows installer (.exe)
- Auto-update system
- Data export (CSV, JSON)
- Backup/restore
- Performance optimization
- Help documentation

**Success Criteria:**
- Clean install experience
- App performs well with 100K+ content items
- Users can export and backup data

---

## User-Provided API Keys

Users must obtain their own API keys:

### YouTube Data API v3
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project, enable YouTube Data API v3
3. Create API key (no OAuth needed for read-only)
4. Free tier: 10,000 quota units/day

### X/Twitter API v2
1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create project and app
3. Generate Bearer Token
4. Free tier: Limited; Basic tier ($100/mo) recommended

### Reddit API
1. Go to [Reddit Apps](https://www.reddit.com/prefs/apps)
2. Create "script" type application
3. Note client ID and secret
4. Free, rate limited to 60 req/min

---

## Data Storage Location

```
Windows: %APPDATA%/Trendr/
├── trendr.db          # SQLite database
├── cache/             # API response cache
├── exports/           # User exports
├── logs/              # Application logs
└── config.json        # Settings (API keys encrypted)
```

**Database Size Estimates:**
- 10K content items: ~50 MB
- 100K content items: ~500 MB
- 1M content items: ~5 GB

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| API keys stored locally | Encrypt using electron-store with safeStorage |
| Database access | SQLite file has OS-level permissions |
| Network requests | HTTPS only, no proxying through third parties |
| Updates | Code-signed installer, auto-update verification |

---

## Distribution Options

1. **Direct Download**
   - Host installer on website/GitHub releases
   - User downloads and runs .exe installer

2. **Microsoft Store** (optional)
   - MSIX package for Store distribution
   - Automatic updates, trusted source

3. **Portable Version**
   - No-install .zip with portable flag
   - All data stored in app folder

---

## Next Steps

1. ~~Initialize Electron + React project with TypeScript~~ → **Completed with Tauri 2 + Rust**
2. ~~Set up SQLite database with schema~~ → **Completed**
3. ~~Build settings page with API key configuration~~ → **Completed (Reddit)**
4. ~~Implement Reddit collector as first platform~~ → **Completed**
5. ~~Create basic topic extraction pipeline~~ → **Completed**
6. ~~Build minimal dashboard to display collected data~~ → **Completed**

---

## Current Project State (Phase 1 Complete)

**Architecture Evolution:** The project migrated from Electron to **Tauri 2 + Rust** for better performance and smaller bundle size.

**What's Working:**
- Reddit OAuth2 authentication and data collection
- Post fetching from configurable subreddits
- Topic extraction via keyword matching
- Creator tracking and deduplication
- Co-occurrence tracking for topic relationships
- Dashboard with stats and manual collection trigger
- Topics explorer with content viewing
- Settings persistence for Reddit credentials

**Technology Stack (Actual):**
| Component | Technology |
|-----------|------------|
| Desktop Framework | Tauri 2 |
| Backend | Rust (tokio, reqwest, rusqlite) |
| Frontend | React 18 + TypeScript + Vite |
| Database | SQLite (rusqlite) |
| Styling | Tailwind CSS |

---

## Phase 2A: X/Twitter Implementation Plan

### Overview

This section documents the implementation plan for adding X (Twitter) data collection to Trendr, following the established patterns from the Reddit collector.

### X API v2 Background

**Authentication:**
- Uses Bearer Token (OAuth 2.0 App-Only)
- User obtains token from [Twitter Developer Portal](https://developer.twitter.com/)
- Token passed in `Authorization: Bearer <token>` header

**API Tiers (as of 2024):**
| Tier | Cost | Tweet Cap | Rate Limits |
|------|------|-----------|-------------|
| Free | $0 | 1,500 tweets/month | 1 request/15 min (search) |
| Basic | $100/mo | 10,000 tweets/month | 60 requests/15 min |
| Pro | $5,000/mo | 1M tweets/month | 300 requests/15 min |

**Recommended:** Basic tier for meaningful data collection.

**Key Endpoints:**
| Endpoint | Purpose | Rate Limit (Basic) |
|----------|---------|-------------------|
| `GET /2/tweets/search/recent` | Search tweets by keyword | 60/15min |
| `GET /2/users/:id/tweets` | Get user's recent tweets | 900/15min |
| `GET /2/users/by/username/:username` | Lookup user by handle | 900/15min |
| `GET /2/tweets/:id` | Get single tweet | 900/15min |

**Data Fields to Request:**
```
tweet.fields=id,text,author_id,created_at,public_metrics,conversation_id
user.fields=id,username,name,public_metrics
expansions=author_id
```

### Data Mapping: X → Trendr Schema

| X API Field | Trendr Table.Column | Notes |
|-------------|---------------------|-------|
| `tweet.id` | `content.platform_id` | Unique tweet identifier |
| `tweet.text` | `content.text_content` | Tweet body (max 280 chars) |
| `tweet.author_id` | Link to `creators` | Via expansion |
| `tweet.created_at` | `content.published_at` | ISO 8601 format |
| `tweet.public_metrics.like_count` | `content.engagement_likes` | |
| `tweet.public_metrics.reply_count` | `content.engagement_comments` | |
| `tweet.public_metrics.retweet_count` | `content.engagement_shares` | |
| `tweet.public_metrics.impression_count` | `content.engagement_views` | May require elevated access |
| `user.id` | `creators.platform_id` | |
| `user.username` | `creators.username` | Handle without @ |
| `user.name` | `creators.display_name` | Display name |
| `user.public_metrics.followers_count` | `creators.follower_count` | |

### Implementation Files

**Files to Create:**
```
src-tauri/src/x.rs              # X collector module (new)
```

**Files to Modify:**
```
src-tauri/src/lib.rs            # Add mod x; register commands
src-tauri/src/settings.rs       # Add XCredentials to AppSettings
src-tauri/src/commands.rs       # Add X command handlers
src/renderer/api.ts             # Add X API methods
src/renderer/pages/Settings.tsx # Add X credentials UI
src/shared/types.ts             # Already has XCredentials defined
```

### Step-by-Step Implementation

#### Step 1: Create X Collector Module

**File:** `src-tauri/src/x.rs`

**Structure (following Reddit pattern):**

```rust
// 1. Response structs for X API v2
#[derive(Deserialize)]
struct TweetSearchResponse {
    data: Option<Vec<Tweet>>,
    includes: Option<Includes>,
    meta: Option<Meta>,
}

#[derive(Deserialize)]
struct Tweet {
    id: String,
    text: String,
    author_id: String,
    created_at: String,
    public_metrics: PublicMetrics,
}

#[derive(Deserialize)]
struct PublicMetrics {
    like_count: i64,
    reply_count: i64,
    retweet_count: i64,
    impression_count: Option<i64>,
}

#[derive(Deserialize)]
struct Includes {
    users: Option<Vec<XUser>>,
}

#[derive(Deserialize)]
struct XUser {
    id: String,
    username: String,
    name: String,
    public_metrics: Option<UserMetrics>,
}

// 2. Core functions
pub async fn test_connection(bearer_token: &str) -> Result<bool, String>
pub async fn collect(bearer_token: &str, queries: &[String]) -> Result<CollectionResult, String>
async fn search_tweets(client: &Client, token: &str, query: &str) -> Result<TweetSearchResponse, String>
async fn process_tweet(tweet: &Tweet, author: Option<&XUser>) -> Result<u32, String>
fn get_or_create_x_creator(user: &XUser) -> Result<String, String>
```

**Key Implementation Notes:**

1. **Rate Limiting:** X API has strict limits. Implement exponential backoff:
   ```rust
   // Between requests
   tokio::time::sleep(Duration::from_millis(1100)).await; // ~54 req/min safe margin

   // On 429 response
   if response.status() == 429 {
       let reset = response.headers().get("x-rate-limit-reset");
       // Wait until reset time
   }
   ```

2. **Search Query Formatting:** X search supports operators:
   ```
   "bitcoin" -is:retweet lang:en  // Exclude retweets, English only
   from:elonmusk                   // From specific user
   #cryptocurrency                 // Hashtag search
   ```

3. **Pagination:** Use `next_token` from meta for fetching more results:
   ```rust
   while let Some(token) = response.meta.next_token {
       // Fetch next page with ?pagination_token={token}
   }
   ```

#### Step 2: Update Settings Module

**File:** `src-tauri/src/settings.rs`

Add to `AppSettings` struct:
```rust
#[derive(Serialize, Deserialize, Default)]
pub struct AppSettings {
    pub reddit: Option<RedditCredentials>,
    pub x: Option<XCredentials>,           // ADD
    pub subreddits: Vec<String>,
    pub x_queries: Vec<String>,            // ADD - search terms for X
    pub x_accounts: Vec<String>,           // ADD - specific accounts to follow
}

#[derive(Serialize, Deserialize, Clone)]
pub struct XCredentials {
    pub bearer_token: String,
}
```

#### Step 3: Add Command Handlers

**File:** `src-tauri/src/commands.rs`

```rust
use crate::x;

#[tauri::command]
pub async fn test_x_connection(bearer_token: String) -> Result<bool, String> {
    x::test_connection(&bearer_token).await
}

#[tauri::command]
pub async fn run_x_collection() -> Result<CollectionResult, String> {
    let settings = crate::settings::load_settings()?;

    let credentials = settings.x.ok_or("X credentials not configured")?;
    let queries = settings.x_queries;

    if queries.is_empty() {
        return Err("No X search queries configured".to_string());
    }

    x::collect(&credentials.bearer_token, &queries).await
}
```

**File:** `src-tauri/src/lib.rs`

```rust
mod x;  // ADD

// In generate_handler! macro, add:
commands::test_x_connection,
commands::run_x_collection,
```

#### Step 4: Update Frontend API

**File:** `src/renderer/api.ts`

```typescript
export async function testXConnection(bearerToken: string): Promise<boolean> {
  return invoke('test_x_connection', { bearerToken });
}

export async function runXCollection(): Promise<CollectionResult> {
  return invoke('run_x_collection');
}

export async function saveXCredentials(credentials: XCredentials): Promise<void> {
  const settings = await getSettings();
  settings.x = credentials;
  return saveSettings(settings);
}
```

#### Step 5: Update Settings UI

**File:** `src/renderer/pages/Settings.tsx`

Add new section for X credentials:
- Bearer Token input (password field)
- Test Connection button
- Search queries input (comma-separated or multi-line)
- Optional: Specific accounts to track

### API Request Examples

**Test Connection:**
```http
GET https://api.twitter.com/2/users/me
Authorization: Bearer <token>
```

**Search Recent Tweets:**
```http
GET https://api.twitter.com/2/tweets/search/recent
    ?query=bitcoin -is:retweet lang:en
    &tweet.fields=id,text,author_id,created_at,public_metrics
    &user.fields=id,username,name,public_metrics
    &expansions=author_id
    &max_results=100
Authorization: Bearer <token>
```

**Get User's Tweets:**
```http
GET https://api.twitter.com/2/users/:id/tweets
    ?tweet.fields=id,text,created_at,public_metrics
    &max_results=100
Authorization: Bearer <token>
```

### Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Process data |
| 400 | Bad Request | Log error, skip query |
| 401 | Unauthorized | Invalid token, prompt user |
| 403 | Forbidden | Endpoint not available on tier |
| 429 | Rate Limited | Wait for reset, backoff |
| 503 | Service Unavailable | Retry with backoff |

### Testing Checklist

- [ ] Bearer token validation works
- [ ] Search returns tweets for valid queries
- [ ] Tweets are stored with correct platform='x'
- [ ] Creators are deduplicated by platform_id
- [ ] Topics are extracted from tweet text
- [ ] Co-occurrences update when multiple topics found
- [ ] Rate limiting prevents 429 errors
- [ ] UI shows X collection status
- [ ] Settings persist X credentials securely

### Collection Strategy

**Recommended approach for meaningful data:**

1. **Keyword Search:** Primary method
   - Configure 5-10 topic-related search queries
   - Example: "bitcoin investing", "AI startups", "side hustle ideas"
   - Fetch latest 100 tweets per query

2. **Influencer Tracking:** Secondary method
   - Track 10-20 key accounts in target niches
   - Fetch their recent tweets for pivot detection
   - Requires user ID lookup first

3. **Frequency:**
   - Every 2-4 hours (vs Reddit's 30 min) due to rate limits
   - Basic tier allows ~10K tweets/month = ~333/day

### Estimated Implementation Effort

| Task | Complexity |
|------|------------|
| `x.rs` collector module | Medium - ~300 lines following Reddit pattern |
| Settings updates | Low - 10-20 lines |
| Commands updates | Low - 20-30 lines |
| Frontend API | Low - 10 lines |
| Settings UI | Medium - ~100 lines new JSX |
| Testing & debugging | Medium - API quirks |

**Total:** Comparable to Reddit implementation, main complexity is X API rate limiting and response structure differences

---

## Phase 2B: YouTube Implementation Plan

### Overview

This section documents the implementation plan for adding YouTube data collection to Trendr, completing the three-platform data collection system (Reddit, X, YouTube).

### YouTube Data API v3 Background

**Authentication:**
- Uses API Key (simplest) or OAuth 2.0 (for user-specific data)
- API Key sufficient for public data (videos, channels, comments)
- User obtains key from [Google Cloud Console](https://console.cloud.google.com/)
- Key passed as query parameter: `?key=YOUR_API_KEY`

**Quota System:**
YouTube uses a quota-based system rather than rate limits:

| Operation | Quota Cost |
|-----------|------------|
| `search.list` | 100 units |
| `videos.list` | 1 unit |
| `channels.list` | 1 unit |
| `commentThreads.list` | 1 unit |
| `playlistItems.list` | 1 unit |

**Daily Quota:** 10,000 units/day (free tier)

**Quota Budget Example:**
- 50 searches/day = 5,000 units
- 500 video details = 500 units
- 500 channel lookups = 500 units
- Remaining: 4,000 units for comments
- **Result:** ~50 topic searches with full enrichment daily

**Key Endpoints:**

| Endpoint | Purpose | Quota |
|----------|---------|-------|
| `GET /search` | Search videos by keyword | 100 |
| `GET /videos` | Get video details (stats, snippet) | 1 |
| `GET /channels` | Get channel details | 1 |
| `GET /commentThreads` | Get video comments | 1 |
| `GET /playlistItems` | Get channel uploads | 1 |

**Data Fields to Request:**
```
part=snippet,statistics,contentDetails
fields=items(id,snippet(title,description,channelId,channelTitle,publishedAt,tags),statistics(viewCount,likeCount,commentCount))
```

### Data Mapping: YouTube → Trendr Schema

| YouTube API Field | Trendr Table.Column | Notes |
|-------------------|---------------------|-------|
| `video.id` | `content.platform_id` | YouTube video ID (11 chars) |
| `video.snippet.title` | `content.text_content` | Combined with description |
| `video.snippet.description` | `content.text_content` | Appended to title |
| `video.snippet.channelId` | Link to `creators` | Channel as creator |
| `video.snippet.publishedAt` | `content.published_at` | ISO 8601 format |
| `video.statistics.likeCount` | `content.engagement_likes` | |
| `video.statistics.commentCount` | `content.engagement_comments` | |
| `video.statistics.viewCount` | `content.engagement_views` | Unique to video |
| `channel.id` | `creators.platform_id` | |
| `channel.snippet.title` | `creators.display_name` | Channel name |
| `channel.snippet.customUrl` | `creators.username` | @handle if available |
| `channel.statistics.subscriberCount` | `creators.follower_count` | Subscriber count |

### Implementation Files

**Files to Create:**
```
src-tauri/src/youtube.rs           # YouTube collector module (new)
```

**Files to Modify:**
```
src-tauri/src/lib.rs               # Add mod youtube; register commands
src-tauri/src/settings.rs          # Add YouTubeCredentials to AppSettings
src-tauri/src/commands.rs          # Add YouTube command handlers
src/renderer/api.ts                # Add YouTube API methods
src/renderer/pages/Settings.tsx    # Add YouTube credentials UI
```

### Step-by-Step Implementation

#### Step 1: Update Settings Module

**File:** `src-tauri/src/settings.rs`

Add to structs:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct YouTubeCredentials {
    #[serde(rename = "apiKey")]
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    pub reddit: Option<RedditCredentials>,
    pub x: Option<XCredentials>,
    pub youtube: Option<YouTubeCredentials>,    // ADD
    // ... existing fields ...
    #[serde(rename = "youtubeQueries")]
    #[serde(default)]
    pub youtube_queries: Vec<String>,           // ADD - search terms
    #[serde(rename = "youtubeChannels")]
    #[serde(default)]
    pub youtube_channels: Vec<String>,          // ADD - channel IDs to track
}
```

#### Step 2: Create YouTube Collector Module

**File:** `src-tauri/src/youtube.rs`

**Structure:**

```rust
use crate::database::with_db;
use crate::settings::YouTubeCredentials;
use crate::topics::extract_topics;
use rusqlite::params;
use serde::Deserialize;

const BASE_URL: &str = "https://www.googleapis.com/youtube/v3";
const USER_AGENT: &str = "Trendr/1.0.0";

// Response structs
#[derive(Debug, Deserialize)]
struct SearchResponse {
    items: Option<Vec<SearchItem>>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchItem {
    id: SearchItemId,
    snippet: Option<Snippet>,
}

#[derive(Debug, Deserialize)]
struct SearchItemId {
    #[serde(rename = "videoId")]
    video_id: Option<String>,
    #[serde(rename = "channelId")]
    channel_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Snippet {
    title: String,
    description: Option<String>,
    #[serde(rename = "channelId")]
    channel_id: String,
    #[serde(rename = "channelTitle")]
    channel_title: String,
    #[serde(rename = "publishedAt")]
    published_at: String,
    tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct VideoResponse {
    items: Option<Vec<VideoItem>>,
}

#[derive(Debug, Deserialize)]
struct VideoItem {
    id: String,
    snippet: Option<Snippet>,
    statistics: Option<Statistics>,
}

#[derive(Debug, Deserialize)]
struct Statistics {
    #[serde(rename = "viewCount")]
    view_count: Option<String>,
    #[serde(rename = "likeCount")]
    like_count: Option<String>,
    #[serde(rename = "commentCount")]
    comment_count: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChannelResponse {
    items: Option<Vec<ChannelItem>>,
}

#[derive(Debug, Deserialize)]
struct ChannelItem {
    id: String,
    snippet: Option<ChannelSnippet>,
    statistics: Option<ChannelStatistics>,
}

#[derive(Debug, Deserialize)]
struct ChannelSnippet {
    title: String,
    #[serde(rename = "customUrl")]
    custom_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChannelStatistics {
    #[serde(rename = "subscriberCount")]
    subscriber_count: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CollectionResult {
    pub posts_collected: u32,
    pub topics_extracted: u32,
}

/// Test connection to YouTube API
pub async fn test_connection(api_key: &str) -> Result<bool, String> {
    let client = reqwest::Client::new();

    // Simple test: search for a common term with minimal quota usage
    let url = format!(
        "{}/search?part=snippet&q=test&maxResults=1&type=video&key={}",
        BASE_URL, api_key
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    if response.status().is_success() {
        Ok(true)
    } else if response.status() == 400 {
        Err("Invalid API key format".to_string())
    } else if response.status() == 403 {
        Err("API key invalid or YouTube Data API not enabled".to_string())
    } else {
        Err(format!("YouTube API error: {}", response.status()))
    }
}

/// Collect videos from YouTube based on search queries
pub async fn collect(
    credentials: &YouTubeCredentials,
    queries: &[String],
) -> Result<CollectionResult, String> {
    let client = reqwest::Client::new();

    let mut total_posts = 0u32;
    let mut total_topics = 0u32;

    for query in queries {
        log::info!("Searching YouTube for: {}", query);

        match search_videos(&client, &credentials.api_key, query).await {
            Ok(video_ids) => {
                // Batch fetch video details (up to 50 at a time)
                for chunk in video_ids.chunks(50) {
                    match get_video_details(&client, &credentials.api_key, chunk).await {
                        Ok(videos) => {
                            for video in videos {
                                match process_video(&video).await {
                                    Ok(topics_found) => {
                                        total_posts += 1;
                                        total_topics += topics_found;
                                    }
                                    Err(e) => {
                                        log::warn!("Failed to process video {}: {}", video.id, e);
                                    }
                                }
                            }
                        }
                        Err(e) => log::error!("Failed to get video details: {}", e),
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to search YouTube for '{}': {}", query, e);
            }
        }

        // Small delay between queries
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    Ok(CollectionResult {
        posts_collected: total_posts,
        topics_extracted: total_topics,
    })
}

/// Search for videos and return video IDs
async fn search_videos(
    client: &reqwest::Client,
    api_key: &str,
    query: &str,
) -> Result<Vec<String>, String> {
    let url = format!(
        "{}/search?part=snippet&q={}&maxResults=25&type=video&order=relevance&key={}",
        BASE_URL,
        urlencoding::encode(query),
        api_key
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("YouTube API error: {}", response.status()));
    }

    let search_response: SearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let video_ids = search_response
        .items
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| item.id.video_id)
        .collect();

    Ok(video_ids)
}

/// Get full video details for a batch of video IDs
async fn get_video_details(
    client: &reqwest::Client,
    api_key: &str,
    video_ids: &[String],
) -> Result<Vec<VideoItem>, String> {
    let ids = video_ids.join(",");
    let url = format!(
        "{}/videos?part=snippet,statistics&id={}&key={}",
        BASE_URL, ids, api_key
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("YouTube API error: {}", response.status()));
    }

    let video_response: VideoResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(video_response.items.unwrap_or_default())
}

/// Process a video and store in database
async fn process_video(video: &VideoItem) -> Result<u32, String> {
    // Check if video already exists
    let exists = with_db(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM content WHERE platform = 'youtube' AND platform_id = ?1",
            params![&video.id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })?;

    if exists {
        return Ok(0);
    }

    let snippet = video.snippet.as_ref().ok_or("Missing snippet")?;

    // Get or create creator (channel)
    let creator_id = get_or_create_creator(&snippet.channel_id, &snippet.channel_title)?;

    // Build text content from title + description
    let text_content = format!(
        "{}\n\n{}",
        snippet.title,
        snippet.description.as_deref().unwrap_or("")
    ).trim().to_string();

    // Parse engagement metrics
    let (views, likes, comments) = match &video.statistics {
        Some(stats) => (
            stats.view_count.as_ref().and_then(|v| v.parse::<i64>().ok()),
            stats.like_count.as_ref().and_then(|v| v.parse::<i64>().ok()).unwrap_or(0),
            stats.comment_count.as_ref().and_then(|v| v.parse::<i64>().ok()).unwrap_or(0),
        ),
        None => (None, 0, 0),
    };

    // Insert content
    let content_id = uuid::Uuid::new_v4().to_string();

    with_db(|conn| {
        conn.execute(
            r#"INSERT INTO content (id, platform, platform_id, creator_id, content_type, text_content,
               engagement_likes, engagement_comments, engagement_views, published_at)
               VALUES (?1, 'youtube', ?2, ?3, 'video', ?4, ?5, ?6, ?7, ?8)"#,
            params![
                &content_id,
                &video.id,
                &creator_id,
                &text_content,
                likes,
                comments,
                views,
                &snippet.published_at
            ],
        )?;
        Ok(())
    })?;

    // Extract topics
    let topics = extract_topics(&text_content)?;
    let topics_count = topics.len() as u32;

    // Link content to topics
    for topic in &topics {
        with_db(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO content_topics (content_id, topic_id, confidence) VALUES (?1, ?2, ?3)",
                params![&content_id, &topic.topic_id, topic.confidence],
            )?;
            Ok(())
        })?;
    }

    // Update co-occurrences
    if topics.len() > 1 {
        let topic_ids: Vec<String> = topics.iter().map(|t| t.topic_id.clone()).collect();
        update_cooccurrences(&topic_ids)?;
    }

    Ok(topics_count)
}

/// Get or create a creator (channel)
fn get_or_create_creator(channel_id: &str, channel_title: &str) -> Result<String, String> {
    // Check if creator exists
    let existing = with_db(|conn| {
        let mut stmt = conn
            .prepare("SELECT id FROM creators WHERE platform = 'youtube' AND platform_id = ?1")?;
        let mut rows = stmt.query(params![channel_id])?;
        if let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            Ok(Some(id))
        } else {
            Ok(None)
        }
    })?;

    if let Some(id) = existing {
        return Ok(id);
    }

    // Create new creator
    let creator_id = uuid::Uuid::new_v4().to_string();
    with_db(|conn| {
        conn.execute(
            "INSERT INTO creators (id, platform, platform_id, username, display_name) VALUES (?1, 'youtube', ?2, ?2, ?3)",
            params![&creator_id, channel_id, channel_title],
        )?;
        Ok(())
    })?;

    Ok(creator_id)
}

/// Update topic co-occurrence counts
fn update_cooccurrences(topic_ids: &[String]) -> Result<(), String> {
    for i in 0..topic_ids.len() {
        for j in (i + 1)..topic_ids.len() {
            let (a, b) = if topic_ids[i] < topic_ids[j] {
                (&topic_ids[i], &topic_ids[j])
            } else {
                (&topic_ids[j], &topic_ids[i])
            };

            with_db(|conn| {
                conn.execute(
                    r#"INSERT INTO topic_cooccurrences (topic_a_id, topic_b_id, frequency, last_seen)
                       VALUES (?1, ?2, 1, CURRENT_TIMESTAMP)
                       ON CONFLICT(topic_a_id, topic_b_id) DO UPDATE SET
                       frequency = frequency + 1, last_seen = CURRENT_TIMESTAMP"#,
                    params![a, b],
                )?;
                Ok(())
            })?;
        }
    }
    Ok(())
}
```

#### Step 3: Add Command Handlers

**File:** `src-tauri/src/commands.rs`

```rust
use crate::youtube;

#[tauri::command]
pub async fn test_youtube_connection(api_key: String) -> Result<bool, String> {
    youtube::test_connection(&api_key).await
}

#[tauri::command]
pub async fn run_youtube_collection() -> Result<CollectionResult, String> {
    let settings = crate::settings::load_settings();

    let credentials = settings.youtube.ok_or("YouTube credentials not configured")?;
    let queries = settings.youtube_queries;

    if queries.is_empty() {
        return Err("No YouTube search queries configured".to_string());
    }

    youtube::collect(&credentials, &queries).await.map(|r| CollectionResult {
        posts_collected: r.posts_collected,
        topics_extracted: r.topics_extracted,
    })
}
```

**File:** `src-tauri/src/lib.rs`

```rust
mod youtube;  // ADD

// In generate_handler! macro, add:
commands::test_youtube_connection,
commands::run_youtube_collection,
```

#### Step 4: Update Frontend API

**File:** `src/renderer/api.ts`

```typescript
export interface YouTubeCredentials {
  apiKey: string;
}

export interface AppSettings {
  // ... existing fields ...
  youtube: YouTubeCredentials | null;
  youtubeQueries: string[];
  youtubeChannels: string[];
}

// Add to api object:
testYouTubeConnection: (apiKey: string): Promise<boolean> =>
  invoke('test_youtube_connection', { apiKey }),

runYouTubeCollection: (): Promise<CollectionResult> =>
  invoke('run_youtube_collection'),
```

#### Step 5: Update Settings UI

**File:** `src/renderer/pages/Settings.tsx`

Add new section after X credentials:

```tsx
{/* YouTube API Section */}
<div className="card mb-6">
  <h2 className="font-semibold text-gray-900 mb-4">YouTube API Credentials</h2>
  <p className="text-sm text-gray-500 mb-4">
    Get your API key from the{' '}
    <a
      href="https://console.cloud.google.com/apis/credentials"
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-600 hover:underline"
    >
      Google Cloud Console
    </a>
    . Enable the YouTube Data API v3. Free tier: 10,000 quota units/day.
  </p>

  <div className="space-y-4">
    <div>
      <label className="label">API Key</label>
      <input
        type="password"
        value={youtubeApiKey}
        onChange={e => setYoutubeApiKey(e.target.value)}
        placeholder="Your YouTube Data API v3 key"
        className="input"
      />
    </div>

    <div>
      <label className="label">Search Queries</label>
      <input
        type="text"
        value={youtubeQueries}
        onChange={e => setYoutubeQueries(e.target.value)}
        placeholder="bitcoin investing, AI tutorial, side hustle"
        className="input"
      />
      <p className="text-sm text-gray-500 mt-1">
        Comma-separated topics to search for on YouTube
      </p>
    </div>

    <button
      onClick={handleTestYouTubeConnection}
      disabled={testingYouTube || !youtubeApiKey}
      className="btn btn-secondary disabled:opacity-50"
    >
      {testingYouTube ? 'Testing...' : 'Test Connection'}
    </button>
  </div>
</div>
```

### API Request Examples

**Test Connection (Search):**
```http
GET https://www.googleapis.com/youtube/v3/search
    ?part=snippet
    &q=test
    &maxResults=1
    &type=video
    &key=YOUR_API_KEY
```

**Search Videos:**
```http
GET https://www.googleapis.com/youtube/v3/search
    ?part=snippet
    &q=bitcoin investing
    &maxResults=25
    &type=video
    &order=relevance
    &key=YOUR_API_KEY
```

**Get Video Details (Batch):**
```http
GET https://www.googleapis.com/youtube/v3/videos
    ?part=snippet,statistics
    &id=VIDEO_ID_1,VIDEO_ID_2,VIDEO_ID_3
    &key=YOUR_API_KEY
```

**Get Channel Details:**
```http
GET https://www.googleapis.com/youtube/v3/channels
    ?part=snippet,statistics
    &id=CHANNEL_ID
    &key=YOUR_API_KEY
```

### Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Process data |
| 400 | Bad Request | Invalid parameters or API key format |
| 403 | Forbidden | API key invalid, API not enabled, or quota exceeded |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limited (rare with quota system) |

**Quota Exceeded Response:**
```json
{
  "error": {
    "code": 403,
    "message": "The request cannot be completed because you have exceeded your quota.",
    "errors": [{
      "reason": "quotaExceeded"
    }]
  }
}
```

### Quota Optimization Strategies

1. **Batch Video Details:** Fetch up to 50 videos per `videos.list` call (1 unit instead of 50)

2. **Minimize Search Calls:** Each search costs 100 units
   - Limit to 5-10 searches per collection cycle
   - Cache video IDs to avoid re-searching

3. **Skip Known Videos:** Check database before fetching details

4. **Prioritize High-Value Queries:** Focus on most relevant topics

5. **Time-Based Collection:** Run once every 4-6 hours instead of frequently

**Quota Budget Example (10,000 units/day):**
| Operation | Count | Units Each | Total |
|-----------|-------|------------|-------|
| Searches | 10 | 100 | 1,000 |
| Video Details (batched) | 10 | 1 | 10 |
| Channel Details | 50 | 1 | 50 |
| **Total Used** | | | **1,060** |
| **Remaining** | | | **8,940** |

### Testing Checklist

- [ ] API key validation works
- [ ] Search returns video IDs
- [ ] Video details are fetched in batches
- [ ] Videos are stored with correct platform='youtube'
- [ ] Channels are created as creators
- [ ] Topics are extracted from title + description
- [ ] View counts are stored in engagement_views
- [ ] Co-occurrences update when multiple topics found
- [ ] Quota errors are handled gracefully
- [ ] UI shows YouTube collection status
- [ ] Settings persist YouTube credentials

### Collection Strategy

**Recommended approach:**

1. **Topic Search (Primary):**
   - Configure 5-10 topic-related search queries
   - Examples: "cryptocurrency news", "AI technology", "passive income"
   - Fetch top 25 videos per query (most relevant)
   - Cost: ~100 units per query = 500-1,000 units

2. **Channel Tracking (Optional Enhancement):**
   - Track specific channels known for topic coverage
   - Use `playlistItems.list` to get channel's uploads playlist
   - More targeted than search for creator pivot detection
   - Cost: 1 unit per channel

3. **Frequency:**
   - Every 4-6 hours recommended
   - YouTube content changes less frequently than Twitter
   - Preserves quota for more queries

4. **Content Quality:**
   - YouTube videos have longer, richer descriptions
   - Better for topic extraction than tweets
   - Video tags provide additional topic signals

### Differences from Reddit/X Implementation

| Aspect | Reddit | X/Twitter | YouTube |
|--------|--------|-----------|---------|
| Auth | OAuth2 (complex) | Bearer Token | API Key (simple) |
| Rate Limiting | 60 req/min | 450 req/15min | Quota-based |
| Content Length | Long posts | 280 chars | Very long |
| Primary ID | post ID | tweet ID | video ID (11 char) |
| Creator Model | Author username | User ID | Channel ID |
| Engagement | Score, Comments | Likes, Retweets, Views | Views, Likes, Comments |
| Best Signal | Comments | Retweets, Engagement | Views, Like ratio |

### Estimated Implementation Effort

| Task | Complexity |
|------|------------|
| `youtube.rs` collector module | Medium - ~350 lines |
| Settings updates | Low - 15-20 lines |
| Commands updates | Low - 20-30 lines |
| Frontend API | Low - 10-15 lines |
| Settings UI | Medium - ~80 lines new JSX |
| Testing & debugging | Low - API is well-documented |

**Total:** Slightly simpler than X/Twitter due to API key auth and well-structured responses
