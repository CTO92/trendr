import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_TOPICS } from '../shared/constants';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';
let saveTimer: NodeJS.Timeout | null = null;

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'trendr.db');
}

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// Save database to disk (debounced)
function scheduleSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveDatabase();
  }, 1000);
}

export function saveDatabase(): void {
  if (db && dbPath) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (error) {
      console.error('Failed to save database:', error);
    }
  }
}

export async function initDatabase(): Promise<void> {
  dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } catch (error) {
      console.error('Failed to load database, creating new one:', error);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  createTables();
  seedDefaultTopics();
  saveDatabase();
}

function createTables(): void {
  const database = getDatabase();

  database.run(`
    CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      follower_count INTEGER,
      primary_topics TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(platform, platform_id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      parent_topic_id TEXT REFERENCES topics(id),
      aliases TEXT,
      keywords TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS topic_motivations (
      topic_id TEXT REFERENCES topics(id),
      motivation TEXT NOT NULL,
      score REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (topic_id, motivation)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      creator_id TEXT REFERENCES creators(id),
      content_type TEXT NOT NULL,
      text_content TEXT,
      engagement_likes INTEGER DEFAULT 0,
      engagement_comments INTEGER DEFAULT 0,
      engagement_shares INTEGER DEFAULT 0,
      engagement_views INTEGER,
      published_at DATETIME,
      collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(platform, platform_id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS content_topics (
      content_id TEXT REFERENCES content(id) ON DELETE CASCADE,
      topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
      confidence REAL NOT NULL,
      PRIMARY KEY (content_id, topic_id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS topic_cooccurrences (
      topic_a_id TEXT REFERENCES topics(id),
      topic_b_id TEXT REFERENCES topics(id),
      frequency INTEGER DEFAULT 1,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (topic_a_id, topic_b_id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      from_topic_id TEXT REFERENCES topics(id),
      to_topic_id TEXT REFERENCES topics(id),
      strength REAL NOT NULL,
      confidence REAL NOT NULL,
      signals TEXT,
      motivation_link TEXT,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      valid_until DATETIME
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS creator_topic_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT REFERENCES creators(id),
      topic_id TEXT REFERENCES topics(id),
      content_count INTEGER DEFAULT 1,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      topic_id TEXT PRIMARY KEY REFERENCES topics(id),
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      topic_id TEXT REFERENCES topics(id),
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`CREATE INDEX IF NOT EXISTS idx_content_platform ON content(platform, published_at)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_content_creator ON content(creator_id, published_at)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_content_collected ON content(collected_at)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_cooccurrences_recent ON topic_cooccurrences(last_seen)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_flows_detected ON flows(detected_at)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_creator_history ON creator_topic_history(creator_id, period_start)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_content_topics_topic ON content_topics(topic_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at)`);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function seedDefaultTopics(): void {
  const database = getDatabase();

  const result = database.exec('SELECT COUNT(*) as count FROM topics');
  const count = result[0]?.values[0]?.[0] as number || 0;

  if (count === 0) {
    const stmt = database.prepare(`
      INSERT INTO topics (id, name, slug, keywords) VALUES (?, ?, ?, ?)
    `);

    for (const topic of DEFAULT_TOPICS) {
      stmt.run([
        uuidv4(),
        topic.name,
        slugify(topic.name),
        JSON.stringify(topic.keywords)
      ]);
    }

    stmt.free();
    scheduleSave();
  }
}

export function closeDatabase(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveDatabase();
  if (db) {
    db.close();
    db = null;
  }
}

// Wrapper class for better-sqlite3 compatible interface
export class PreparedStatement {
  private sql: string;

  constructor(sql: string) {
    this.sql = sql;
  }

  run(...params: any[]): void {
    const database = getDatabase();
    const flatParams = params.flat();
    database.run(this.sql, flatParams);
    scheduleSave();
  }

  get(...params: any[]): any {
    const database = getDatabase();
    const flatParams = params.flat();
    const stmt = database.prepare(this.sql);
    stmt.bind(flatParams);

    if (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      stmt.free();

      const row: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        row[col] = values[i];
      });
      return row;
    }

    stmt.free();
    return undefined;
  }

  all(...params: unknown[]): Record<string, unknown>[] {
    const database = getDatabase();
    const flatParams = params.flat();
    const results: Record<string, unknown>[] = [];

    const stmt = database.prepare(this.sql);
    stmt.bind(flatParams);

    const columns = stmt.getColumnNames();

    while (stmt.step()) {
      const values = stmt.get();
      const row: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        row[col] = values[i];
      });
      results.push(row);
    }

    stmt.free();
    return results;
  }
}

// Database wrapper with prepare method
export class DatabaseWrapper {
  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(sql);
  }

  exec(sql: string): void {
    const database = getDatabase();
    database.run(sql);
    scheduleSave();
  }
}

let wrapperInstance: DatabaseWrapper | null = null;

export function getDatabaseWrapper(): DatabaseWrapper {
  if (!wrapperInstance) {
    wrapperInstance = new DatabaseWrapper();
  }
  return wrapperInstance;
}
