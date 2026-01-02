import { v4 as uuidv4 } from 'uuid';
import { getDatabaseWrapper, DatabaseWrapper } from '../database';
import { getSettings } from '../settings';
import { TopicExtractor } from '../processors/topic-extractor';
import type { RedditCredentials, RedditPost } from '../../shared/types';

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface RedditListingResponse {
  data: {
    children: Array<{
      data: {
        id: string;
        subreddit: string;
        author: string;
        title: string;
        selftext: string;
        score: number;
        num_comments: number;
        created_utc: number;
        permalink: string;
      };
    }>;
    after: string | null;
  };
}

export class RedditCollector {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private topicExtractor: TopicExtractor;

  constructor() {
    this.topicExtractor = new TopicExtractor();
  }

  private async getAccessToken(credentials: RedditCredentials): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Trendr/1.0.0',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: credentials.username,
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get Reddit access token: ${response.status}`);
    }

    const data = await response.json() as RedditTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);

    return this.accessToken;
  }

  async testConnection(): Promise<boolean> {
    const settings = await getSettings();
    if (!settings.reddit) {
      throw new Error('Reddit credentials not configured');
    }

    try {
      const token = await this.getAccessToken(settings.reddit);

      const response = await fetch('https://oauth.reddit.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Trendr/1.0.0',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Reddit connection test failed:', error);
      return false;
    }
  }

  async collect(): Promise<{ postsCollected: number; topicsExtracted: number }> {
    const settings = await getSettings();
    if (!settings.reddit) {
      throw new Error('Reddit credentials not configured');
    }

    const token = await this.getAccessToken(settings.reddit);
    const db = getDatabaseWrapper();

    let totalPosts = 0;
    let totalTopics = 0;

    // Collect from each subreddit
    for (const subreddit of settings.subreddits) {
      try {
        const posts = await this.fetchSubredditPosts(token, subreddit);

        for (const post of posts) {
          const result = await this.processPost(post, db);
          totalPosts++;
          totalTopics += result.topicsFound;
        }

        // Rate limiting - wait 1 second between subreddits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error collecting from r/${subreddit}:`, error);
      }
    }

    return { postsCollected: totalPosts, topicsExtracted: totalTopics };
  }

  private async fetchSubredditPosts(token: string, subreddit: string): Promise<RedditPost[]> {
    const response = await fetch(`https://oauth.reddit.com/r/${subreddit}/hot?limit=25`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Trendr/1.0.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch r/${subreddit}: ${response.status}`);
    }

    const data = await response.json() as RedditListingResponse;

    return data.data.children.map(child => ({
      id: child.data.id,
      subreddit: child.data.subreddit,
      author: child.data.author,
      title: child.data.title,
      selftext: child.data.selftext,
      score: child.data.score,
      numComments: child.data.num_comments,
      createdUtc: child.data.created_utc,
      permalink: child.data.permalink,
    }));
  }

  private async processPost(
    post: RedditPost,
    db: DatabaseWrapper
  ): Promise<{ topicsFound: number }> {
    // Check if post already exists
    const existingStmt = db.prepare('SELECT id FROM content WHERE platform = ? AND platform_id = ?');
    const existing = existingStmt.get('reddit', post.id);

    if (existing) {
      return { topicsFound: 0 };
    }

    // Create or get creator
    const creatorId = await this.getOrCreateCreator(post.author, db);

    // Insert content
    const contentId = uuidv4();
    const textContent = `${post.title}\n\n${post.selftext}`.trim();

    const insertContentStmt = db.prepare(`
      INSERT INTO content (
        id, platform, platform_id, creator_id, content_type, text_content,
        engagement_likes, engagement_comments, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertContentStmt.run(
      contentId,
      'reddit',
      post.id,
      creatorId,
      'post',
      textContent,
      post.score,
      post.numComments,
      new Date(post.createdUtc * 1000).toISOString()
    );

    // Extract topics
    const topics = this.topicExtractor.extractTopics(textContent);

    // Link content to topics and update co-occurrences
    const insertTopicLinkStmt = db.prepare(`
      INSERT OR REPLACE INTO content_topics (content_id, topic_id, confidence)
      VALUES (?, ?, ?)
    `);

    for (const topic of topics) {
      insertTopicLinkStmt.run(contentId, topic.topicId, topic.confidence);
    }

    // Update co-occurrences
    if (topics.length > 1) {
      this.updateCooccurrences(topics.map(t => t.topicId), db);
    }

    return { topicsFound: topics.length };
  }

  private async getOrCreateCreator(
    username: string,
    db: DatabaseWrapper
  ): Promise<string> {
    const selectStmt = db.prepare('SELECT id FROM creators WHERE platform = ? AND username = ?');
    const existing = selectStmt.get('reddit', username) as { id: string } | undefined;

    if (existing) {
      return existing.id;
    }

    const creatorId = uuidv4();
    const insertStmt = db.prepare(`
      INSERT INTO creators (id, platform, platform_id, username)
      VALUES (?, ?, ?, ?)
    `);
    insertStmt.run(creatorId, 'reddit', username, username);

    return creatorId;
  }

  private updateCooccurrences(topicIds: string[], db: DatabaseWrapper): void {
    const upsertStmt = db.prepare(`
      INSERT INTO topic_cooccurrences (topic_a_id, topic_b_id, frequency, last_seen)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(topic_a_id, topic_b_id) DO UPDATE SET
        frequency = frequency + 1,
        last_seen = CURRENT_TIMESTAMP
    `);

    // Create co-occurrence for all pairs
    for (let i = 0; i < topicIds.length; i++) {
      for (let j = i + 1; j < topicIds.length; j++) {
        // Always store in consistent order (alphabetically)
        const [a, b] = [topicIds[i], topicIds[j]].sort();
        upsertStmt.run(a, b);
      }
    }
  }
}
