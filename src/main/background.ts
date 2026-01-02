import cron from 'node-cron';
import { RedditCollector } from './collectors/reddit';
import { getSettings } from './settings';

interface CollectionState {
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastError: string | null;
}

export class BackgroundCollector {
  private cronJob: cron.ScheduledTask | null = null;
  private redditCollector: RedditCollector;
  private state: CollectionState = {
    isRunning: false,
    lastRunAt: null,
    nextRunAt: null,
    lastError: null,
  };

  constructor() {
    this.redditCollector = new RedditCollector();
  }

  async start(): Promise<void> {
    const settings = await getSettings();
    const intervalMinutes = settings.collectionIntervalMinutes || 30;

    // Stop existing job if any
    this.stop();

    // Create new cron job
    // Run every N minutes
    this.cronJob = cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
      await this.runCollection();
    });

    // Calculate next run time
    this.state.nextRunAt = new Date(Date.now() + intervalMinutes * 60 * 1000);

    console.log(`Background collector started, running every ${intervalMinutes} minutes`);
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.state.nextRunAt = null;
    console.log('Background collector stopped');
  }

  async runNow(): Promise<void> {
    await this.runCollection();
  }

  private async runCollection(): Promise<void> {
    if (this.state.isRunning) {
      console.log('Collection already in progress, skipping');
      return;
    }

    this.state.isRunning = true;
    this.state.lastError = null;

    console.log('Starting data collection...');

    try {
      const settings = await getSettings();

      // Collect from Reddit
      if (settings.reddit) {
        console.log('Collecting from Reddit...');
        const result = await this.redditCollector.collect();
        console.log(`Reddit: ${result.postsCollected} posts, ${result.topicsExtracted} topic matches`);
      }

      // TODO: Add YouTube and X collectors

      this.state.lastRunAt = new Date();
      this.state.lastError = null;

      // Update next run time
      const intervalMinutes = settings.collectionIntervalMinutes || 30;
      this.state.nextRunAt = new Date(Date.now() + intervalMinutes * 60 * 1000);

      console.log('Data collection completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.state.lastError = errorMessage;
      console.error('Collection error:', errorMessage);
    } finally {
      this.state.isRunning = false;
    }
  }

  getStatus(): {
    isRunning: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastError: string | null;
  } {
    return {
      isRunning: this.state.isRunning,
      lastRunAt: this.state.lastRunAt?.toISOString() || null,
      nextRunAt: this.state.nextRunAt?.toISOString() || null,
      lastError: this.state.lastError,
    };
  }

  async testRedditConnection(): Promise<boolean> {
    return this.redditCollector.testConnection();
  }
}

// Singleton instance for IPC access
let collectorInstance: BackgroundCollector | null = null;

export function getCollector(): BackgroundCollector {
  if (!collectorInstance) {
    collectorInstance = new BackgroundCollector();
  }
  return collectorInstance;
}
