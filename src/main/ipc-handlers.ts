import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';
import { getSettings, saveSettings } from './settings';
import { getCollector } from './background';
import { getDatabaseWrapper } from './database';
import type { IpcResponse, Topic, Content, DashboardStats, Alert } from '../shared/types';

export function setupIpcHandlers(): void {
  // Settings handlers
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async (): Promise<IpcResponse<any>> => {
    try {
      const settings = await getSettings();
      return { success: true, data: settings };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_, settings): Promise<IpcResponse<void>> => {
    try {
      await saveSettings(settings);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEST_REDDIT_CONNECTION, async (): Promise<IpcResponse<boolean>> => {
    try {
      const collector = getCollector();
      const result = await collector.testRedditConnection();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Collection handlers
  ipcMain.handle(IPC_CHANNELS.START_COLLECTION, async (): Promise<IpcResponse<void>> => {
    try {
      const collector = getCollector();
      await collector.start();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.STOP_COLLECTION, async (): Promise<IpcResponse<void>> => {
    try {
      const collector = getCollector();
      collector.stop();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_COLLECTION_STATUS, async (): Promise<IpcResponse<any>> => {
    try {
      const collector = getCollector();
      const status = collector.getStatus();
      return { success: true, data: status };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.RUN_COLLECTION_NOW, async (): Promise<IpcResponse<void>> => {
    try {
      const collector = getCollector();
      await collector.runNow();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Topics handlers
  ipcMain.handle(IPC_CHANNELS.GET_TOPICS, async (_, { limit = 50, offset = 0 }): Promise<IpcResponse<Topic[]>> => {
    try {
      const db = getDatabaseWrapper();
      const stmt = db.prepare(`
        SELECT
          t.id, t.name, t.slug, t.parent_topic_id as parentTopicId,
          t.aliases, t.created_at as createdAt,
          COUNT(ct.content_id) as contentCount
        FROM topics t
        LEFT JOIN content_topics ct ON t.id = ct.topic_id
        GROUP BY t.id
        ORDER BY contentCount DESC
        LIMIT ? OFFSET ?
      `);
      const rows = stmt.all(limit, offset) as any[];

      const topics = rows.map(row => ({
        ...row,
        aliases: row.aliases ? JSON.parse(row.aliases) : [],
      }));

      return { success: true, data: topics };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_TOPIC_DETAILS, async (_, topicId): Promise<IpcResponse<any>> => {
    try {
      const db = getDatabaseWrapper();

      const topicStmt = db.prepare(`
        SELECT id, name, slug, parent_topic_id as parentTopicId, aliases, created_at as createdAt
        FROM topics WHERE id = ?
      `);
      const topic = topicStmt.get(topicId) as any;

      if (!topic) {
        return { success: false, error: 'Topic not found' };
      }

      const countStmt = db.prepare('SELECT COUNT(*) as count FROM content_topics WHERE topic_id = ?');
      const countResult = countStmt.get(topicId) as { count: number };

      return {
        success: true,
        data: {
          ...topic,
          aliases: topic.aliases ? JSON.parse(topic.aliases) : [],
          contentCount: countResult.count,
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH_TOPICS, async (_, query): Promise<IpcResponse<Topic[]>> => {
    try {
      const db = getDatabaseWrapper();
      const stmt = db.prepare(`
        SELECT id, name, slug, parent_topic_id as parentTopicId, aliases, created_at as createdAt
        FROM topics
        WHERE name LIKE ? OR slug LIKE ?
        LIMIT 20
      `);
      const searchTerm = `%${query}%`;
      const rows = stmt.all(searchTerm, searchTerm) as any[];

      const topics = rows.map(row => ({
        ...row,
        aliases: row.aliases ? JSON.parse(row.aliases) : [],
      }));

      return { success: true, data: topics };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Content handlers
  ipcMain.handle(IPC_CHANNELS.GET_CONTENT, async (_, { limit = 50, offset = 0 }): Promise<IpcResponse<Content[]>> => {
    try {
      const db = getDatabaseWrapper();
      const stmt = db.prepare(`
        SELECT
          id, platform, platform_id as platformId, creator_id as creatorId,
          content_type as contentType, text_content as textContent,
          engagement_likes as engagementLikes, engagement_comments as engagementComments,
          engagement_shares as engagementShares, engagement_views as engagementViews,
          published_at as publishedAt, collected_at as collectedAt
        FROM content
        ORDER BY collected_at DESC
        LIMIT ? OFFSET ?
      `);
      const content = stmt.all(limit, offset) as unknown as Content[];

      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_CONTENT_BY_TOPIC, async (_, { topicId, limit = 20 }): Promise<IpcResponse<Content[]>> => {
    try {
      const db = getDatabaseWrapper();
      const stmt = db.prepare(`
        SELECT
          c.id, c.platform, c.platform_id as platformId, c.creator_id as creatorId,
          c.content_type as contentType, c.text_content as textContent,
          c.engagement_likes as engagementLikes, c.engagement_comments as engagementComments,
          c.engagement_shares as engagementShares, c.engagement_views as engagementViews,
          c.published_at as publishedAt, c.collected_at as collectedAt
        FROM content c
        JOIN content_topics ct ON c.id = ct.content_id
        WHERE ct.topic_id = ?
        ORDER BY c.collected_at DESC
        LIMIT ?
      `);
      const content = stmt.all(topicId, limit) as unknown as Content[];

      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Dashboard handlers
  ipcMain.handle(IPC_CHANNELS.GET_DASHBOARD_STATS, async (): Promise<IpcResponse<DashboardStats>> => {
    try {
      const db = getDatabaseWrapper();

      const totalContentStmt = db.prepare('SELECT COUNT(*) as count FROM content');
      const totalContent = (totalContentStmt.get() as { count: number }).count;

      const totalTopicsStmt = db.prepare('SELECT COUNT(*) as count FROM topics');
      const totalTopics = (totalTopicsStmt.get() as { count: number }).count;

      const totalCreatorsStmt = db.prepare('SELECT COUNT(*) as count FROM creators');
      const totalCreators = (totalCreatorsStmt.get() as { count: number }).count;

      const recentContentStmt = db.prepare(`
        SELECT COUNT(*) as count FROM content
        WHERE collected_at > datetime('now', '-7 days')
      `);
      const contentLast7Days = (recentContentStmt.get() as { count: number }).count;

      const topTopicsStmt = db.prepare(`
        SELECT t.name, COUNT(ct.content_id) as count
        FROM topics t
        JOIN content_topics ct ON t.id = ct.topic_id
        GROUP BY t.id
        ORDER BY count DESC
        LIMIT 10
      `);
      const topTopics = topTopicsStmt.all() as { name: string; count: number }[];

      return {
        success: true,
        data: {
          totalContent,
          totalTopics,
          totalCreators,
          contentLast7Days,
          topTopics,
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Alerts handlers
  ipcMain.handle(IPC_CHANNELS.GET_ALERTS, async (_, limit = 50): Promise<IpcResponse<Alert[]>> => {
    try {
      const db = getDatabaseWrapper();
      const stmt = db.prepare(`
        SELECT id, alert_type as alertType, topic_id as topicId, message, read, created_at as createdAt
        FROM alerts
        ORDER BY created_at DESC
        LIMIT ?
      `);
      const alerts = stmt.all(limit) as any[];

      return {
        success: true,
        data: alerts.map(a => ({ ...a, read: Boolean(a.read) })),
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.MARK_ALERT_READ, async (_, alertId): Promise<IpcResponse<void>> => {
    try {
      const db = getDatabaseWrapper();
      const stmt = db.prepare('UPDATE alerts SET read = 1 WHERE id = ?');
      stmt.run(alertId);

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
