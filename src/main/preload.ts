import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';
import type { AppSettings, IpcResponse, DashboardStats, Topic, Content, Alert, CollectionStatus } from '../shared/types';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: (): Promise<IpcResponse<AppSettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

  saveSettings: (settings: Partial<AppSettings>): Promise<IpcResponse<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

  testRedditConnection: (): Promise<IpcResponse<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEST_REDDIT_CONNECTION),

  // Collection
  startCollection: (): Promise<IpcResponse<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.START_COLLECTION),

  stopCollection: (): Promise<IpcResponse<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.STOP_COLLECTION),

  getCollectionStatus: (): Promise<IpcResponse<CollectionStatus>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_COLLECTION_STATUS),

  runCollectionNow: (): Promise<IpcResponse<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.RUN_COLLECTION_NOW),

  // Topics
  getTopics: (limit?: number, offset?: number): Promise<IpcResponse<Topic[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TOPICS, { limit, offset }),

  getTopicDetails: (topicId: string): Promise<IpcResponse<Topic & { contentCount: number }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TOPIC_DETAILS, topicId),

  searchTopics: (query: string): Promise<IpcResponse<Topic[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_TOPICS, query),

  // Content
  getContent: (limit?: number, offset?: number): Promise<IpcResponse<Content[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CONTENT, { limit, offset }),

  getContentByTopic: (topicId: string, limit?: number): Promise<IpcResponse<Content[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CONTENT_BY_TOPIC, { topicId, limit }),

  // Dashboard
  getDashboardStats: (): Promise<IpcResponse<DashboardStats>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_DASHBOARD_STATS),

  // Alerts
  getAlerts: (limit?: number): Promise<IpcResponse<Alert[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ALERTS, limit),

  markAlertRead: (alertId: string): Promise<IpcResponse<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.MARK_ALERT_READ, alertId),
});

// Type declaration for window.electronAPI
export type ElectronAPI = {
  getSettings: () => Promise<IpcResponse<AppSettings>>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<IpcResponse<void>>;
  testRedditConnection: () => Promise<IpcResponse<boolean>>;
  startCollection: () => Promise<IpcResponse<void>>;
  stopCollection: () => Promise<IpcResponse<void>>;
  getCollectionStatus: () => Promise<IpcResponse<CollectionStatus>>;
  runCollectionNow: () => Promise<IpcResponse<void>>;
  getTopics: (limit?: number, offset?: number) => Promise<IpcResponse<Topic[]>>;
  getTopicDetails: (topicId: string) => Promise<IpcResponse<Topic & { contentCount: number }>>;
  searchTopics: (query: string) => Promise<IpcResponse<Topic[]>>;
  getContent: (limit?: number, offset?: number) => Promise<IpcResponse<Content[]>>;
  getContentByTopic: (topicId: string, limit?: number) => Promise<IpcResponse<Content[]>>;
  getDashboardStats: () => Promise<IpcResponse<DashboardStats>>;
  getAlerts: (limit?: number) => Promise<IpcResponse<Alert[]>>;
  markAlertRead: (alertId: string) => Promise<IpcResponse<void>>;
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
