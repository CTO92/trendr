import { invoke } from '@tauri-apps/api/core';

// Types
export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export interface AppSettings {
  reddit: RedditCredentials | null;
  collectionIntervalMinutes: number;
  subreddits: string[];
  searchQueries: string[];
}

export interface Topic {
  id: string;
  name: string;
  slug: string;
  parentTopicId: string | null;
  aliases: string[];
  createdAt: string;
  contentCount?: number;
}

export interface Content {
  id: string;
  platform: string;
  platformId: string;
  creatorId: string | null;
  contentType: string;
  textContent: string | null;
  engagementLikes: number;
  engagementComments: number;
  publishedAt: string | null;
  collectedAt: string;
}

export interface Alert {
  id: string;
  alertType: string;
  topicId: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface DashboardStats {
  totalContent: number;
  totalTopics: number;
  totalCreators: number;
  contentLast7Days: number;
  topTopics: { name: string; count: number }[];
}

export interface CollectionStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface CollectionResult {
  postsCollected: number;
  topicsExtracted: number;
}

// API functions
export const api = {
  // Settings
  getSettings: (): Promise<AppSettings> => invoke('get_settings'),

  saveSettings: (settings: AppSettings): Promise<void> =>
    invoke('save_settings', { settingsData: settings }),

  testRedditConnection: (): Promise<boolean> => invoke('test_reddit_connection'),

  // Collection
  runCollection: (): Promise<CollectionResult> => invoke('run_collection'),

  getCollectionStatus: (): Promise<CollectionStatus> => invoke('get_collection_status'),

  // Topics
  getTopics: (limit?: number, offset?: number): Promise<Topic[]> =>
    invoke('get_topics', { limit, offset }),

  getTopicDetails: (topicId: string): Promise<Topic> =>
    invoke('get_topic_details', { topicId }),

  searchTopics: (query: string): Promise<Topic[]> =>
    invoke('search_topics', { query }),

  // Content
  getContent: (limit?: number, offset?: number): Promise<Content[]> =>
    invoke('get_content', { limit, offset }),

  getContentByTopic: (topicId: string, limit?: number): Promise<Content[]> =>
    invoke('get_content_by_topic', { topicId, limit }),

  // Dashboard
  getDashboardStats: (): Promise<DashboardStats> => invoke('get_dashboard_stats'),

  // Alerts
  getAlerts: (limit?: number): Promise<Alert[]> => invoke('get_alerts', { limit }),

  markAlertRead: (alertId: string): Promise<void> =>
    invoke('mark_alert_read', { alertId }),
};

export default api;
