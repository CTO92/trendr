// Platform types
export type Platform = 'youtube' | 'x' | 'reddit';
export type ContentType = 'video' | 'post' | 'thread' | 'comment';

// Motivation types
export type MotivationType =
  | 'wealth_accumulation'
  | 'status_signaling'
  | 'community_belonging'
  | 'identity_expression'
  | 'knowledge_expertise'
  | 'entertainment_escapism'
  | 'security_stability';

// Database entities
export interface Creator {
  id: string;
  platform: Platform;
  platformId: string;
  username: string;
  displayName: string | null;
  followerCount: number | null;
  primaryTopics: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  name: string;
  slug: string;
  parentTopicId: string | null;
  aliases: string[];
  createdAt: string;
}

export interface Content {
  id: string;
  platform: Platform;
  platformId: string;
  creatorId: string | null;
  contentType: ContentType;
  textContent: string | null;
  engagementLikes: number;
  engagementComments: number;
  engagementShares: number;
  engagementViews: number | null;
  publishedAt: string | null;
  collectedAt: string;
}

export interface ContentTopic {
  contentId: string;
  topicId: string;
  confidence: number;
}

export interface TopicCooccurrence {
  topicAId: string;
  topicBId: string;
  frequency: number;
  lastSeen: string;
  createdAt: string;
}

export interface Flow {
  id: string;
  fromTopicId: string;
  toTopicId: string;
  strength: number;
  confidence: number;
  signals: FlowSignal[];
  motivationLink: MotivationType | null;
  detectedAt: string;
  validUntil: string;
}

export interface FlowSignal {
  type: 'creator_pivot' | 'co_occurrence' | 'motivation_match';
  weight: number;
  evidence: string;
}

export interface Alert {
  id: string;
  alertType: 'flow_detected' | 'creator_pivot' | 'topic_surge';
  topicId: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

// Settings
export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export interface YouTubeCredentials {
  apiKey: string;
}

export interface XCredentials {
  bearerToken: string;
}

export interface AppSettings {
  reddit: RedditCredentials | null;
  youtube: YouTubeCredentials | null;
  x: XCredentials | null;
  collectionIntervalMinutes: number;
  subreddits: string[];
  searchQueries: string[];
}

// IPC Types
export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Collection status
export interface CollectionStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

// Reddit API types
export interface RedditPost {
  id: string;
  subreddit: string;
  author: string;
  title: string;
  selftext: string;
  score: number;
  numComments: number;
  createdUtc: number;
  permalink: string;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  createdUtc: number;
  postId: string;
}

// Stats for dashboard
export interface DashboardStats {
  totalContent: number;
  totalTopics: number;
  totalCreators: number;
  contentLast7Days: number;
  topTopics: { name: string; count: number }[];
}
