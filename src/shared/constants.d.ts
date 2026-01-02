export declare const IPC_CHANNELS: {
    readonly GET_SETTINGS: "settings:get";
    readonly SAVE_SETTINGS: "settings:save";
    readonly TEST_REDDIT_CONNECTION: "settings:test-reddit";
    readonly START_COLLECTION: "collection:start";
    readonly STOP_COLLECTION: "collection:stop";
    readonly GET_COLLECTION_STATUS: "collection:status";
    readonly RUN_COLLECTION_NOW: "collection:run-now";
    readonly GET_TOPICS: "topics:get";
    readonly GET_TOPIC_DETAILS: "topics:get-details";
    readonly SEARCH_TOPICS: "topics:search";
    readonly GET_CONTENT: "content:get";
    readonly GET_CONTENT_BY_TOPIC: "content:get-by-topic";
    readonly GET_DASHBOARD_STATS: "dashboard:stats";
    readonly GET_ALERTS: "alerts:get";
    readonly MARK_ALERT_READ: "alerts:mark-read";
};
export declare const DEFAULT_TOPICS: {
    name: string;
    keywords: string[];
}[];
export declare const MOTIVATION_PATTERNS: Record<string, RegExp[]>;
export declare const DEFAULT_SETTINGS: Partial<import('./types').AppSettings>;
//# sourceMappingURL=constants.d.ts.map