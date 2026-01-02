import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { AppSettings, RedditCredentials, YouTubeCredentials, XCredentials } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';

interface StoreData {
  reddit: RedditCredentials | null;
  youtube: YouTubeCredentials | null;
  x: XCredentials | null;
  collectionIntervalMinutes: number;
  subreddits: string[];
  searchQueries: string[];
}

const defaultData: StoreData = {
  reddit: null,
  youtube: null,
  x: null,
  collectionIntervalMinutes: DEFAULT_SETTINGS.collectionIntervalMinutes || 30,
  subreddits: DEFAULT_SETTINGS.subreddits || [],
  searchQueries: DEFAULT_SETTINGS.searchQueries || [],
};

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadStore(): StoreData {
  const filePath = getSettingsPath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return { ...defaultData, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return { ...defaultData };
}

function saveStore(data: StoreData): void {
  const filePath = getSettingsPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export async function getSettings(): Promise<AppSettings> {
  const data = loadStore();
  return {
    reddit: data.reddit,
    youtube: data.youtube,
    x: data.x,
    collectionIntervalMinutes: data.collectionIntervalMinutes,
    subreddits: data.subreddits,
    searchQueries: data.searchQueries,
  };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const data = loadStore();

  if (settings.reddit !== undefined) {
    data.reddit = settings.reddit;
  }
  if (settings.youtube !== undefined) {
    data.youtube = settings.youtube;
  }
  if (settings.x !== undefined) {
    data.x = settings.x;
  }
  if (settings.collectionIntervalMinutes !== undefined) {
    data.collectionIntervalMinutes = settings.collectionIntervalMinutes;
  }
  if (settings.subreddits !== undefined) {
    data.subreddits = settings.subreddits;
  }
  if (settings.searchQueries !== undefined) {
    data.searchQueries = settings.searchQueries;
  }

  saveStore(data);
}

export async function clearSettings(): Promise<void> {
  saveStore({ ...defaultData });
}
