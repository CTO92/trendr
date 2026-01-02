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

1. Initialize Electron + React project with TypeScript
2. Set up SQLite database with schema
3. Build settings page with API key configuration
4. Implement Reddit collector as first platform
5. Create basic topic extraction pipeline
6. Build minimal dashboard to display collected data
