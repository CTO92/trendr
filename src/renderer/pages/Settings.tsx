import React, { useEffect, useState } from 'react';
import { api, AppSettings, RedditCredentials, XCredentials, YouTubeCredentials } from '../api';

function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingReddit, setTestingReddit] = useState(false);
  const [testingX, setTestingX] = useState(false);
  const [testingYouTube, setTestingYouTube] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reddit form state
  const [redditClientId, setRedditClientId] = useState('');
  const [redditClientSecret, setRedditClientSecret] = useState('');
  const [redditUsername, setRedditUsername] = useState('');
  const [redditPassword, setRedditPassword] = useState('');
  const [subreddits, setSubreddits] = useState('');

  // X form state
  const [xBearerToken, setXBearerToken] = useState('');
  const [xQueries, setXQueries] = useState('');

  // YouTube form state
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [youtubeQueries, setYoutubeQueries] = useState('');

  // General settings
  const [collectionInterval, setCollectionInterval] = useState(30);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);

      // Populate Reddit form
      if (data.reddit) {
        setRedditClientId(data.reddit.clientId);
        setRedditClientSecret(data.reddit.clientSecret);
        setRedditUsername(data.reddit.username);
        setRedditPassword(data.reddit.password);
      }
      setSubreddits(data.subreddits.join(', '));

      // Populate X form
      if (data.x) {
        setXBearerToken(data.x.bearerToken);
      }
      setXQueries((data.xQueries || []).join(', '));

      // Populate YouTube form
      if (data.youtube) {
        setYoutubeApiKey(data.youtube.apiKey);
      }
      setYoutubeQueries((data.youtubeQueries || []).join(', '));

      setCollectionInterval(data.collectionIntervalMinutes);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setTestResult(null);

    try {
      const reddit: RedditCredentials | null =
        redditClientId && redditClientSecret && redditUsername && redditPassword
          ? {
              clientId: redditClientId.trim(),
              clientSecret: redditClientSecret.trim(),
              username: redditUsername.trim(),
              password: redditPassword,
            }
          : null;

      const x: XCredentials | null = xBearerToken.trim()
        ? { bearerToken: xBearerToken.trim() }
        : null;

      const subredditList = subreddits
        .split(',')
        .map(s => s.trim().toLowerCase().replace(/^r\//, ''))
        .filter(s => s.length > 0);

      const xQueryList = xQueries
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const youtube: YouTubeCredentials | null = youtubeApiKey.trim()
        ? { apiKey: youtubeApiKey.trim() }
        : null;

      const youtubeQueryList = youtubeQueries
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      await api.saveSettings({
        reddit,
        x,
        youtube,
        subreddits: subredditList,
        xQueries: xQueryList,
        youtubeQueries: youtubeQueryList,
        collectionIntervalMinutes: collectionInterval,
        searchQueries: settings?.searchQueries || [],
      });

      setTestResult({ success: true, message: 'Settings saved successfully!' });
    } catch (error) {
      setTestResult({ success: false, message: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestRedditConnection() {
    setTestingReddit(true);
    setTestResult(null);

    try {
      // Save credentials first
      await handleSave();

      const success = await api.testRedditConnection();

      if (success) {
        setTestResult({ success: true, message: 'Reddit connection successful!' });
      } else {
        setTestResult({
          success: false,
          message: 'Reddit connection failed. Please check your credentials.',
        });
      }
    } catch (error) {
      setTestResult({ success: false, message: String(error) || 'Connection test failed' });
    } finally {
      setTestingReddit(false);
    }
  }

  async function handleTestXConnection() {
    setTestingX(true);
    setTestResult(null);

    try {
      if (!xBearerToken.trim()) {
        setTestResult({ success: false, message: 'Please enter a Bearer Token' });
        return;
      }

      const success = await api.testXConnection(xBearerToken.trim());

      if (success) {
        setTestResult({ success: true, message: 'X connection successful!' });
        // Save settings on success
        await handleSave();
      } else {
        setTestResult({
          success: false,
          message: 'X connection failed. Please check your Bearer Token.',
        });
      }
    } catch (error) {
      setTestResult({ success: false, message: String(error) || 'X connection test failed' });
    } finally {
      setTestingX(false);
    }
  }

  async function handleTestYouTubeConnection() {
    setTestingYouTube(true);
    setTestResult(null);

    try {
      if (!youtubeApiKey.trim()) {
        setTestResult({ success: false, message: 'Please enter an API Key' });
        return;
      }

      const success = await api.testYouTubeConnection(youtubeApiKey.trim());

      if (success) {
        setTestResult({ success: true, message: 'YouTube connection successful!' });
        // Save settings on success
        await handleSave();
      } else {
        setTestResult({
          success: false,
          message: 'YouTube connection failed. Please check your API Key.',
        });
      }
    } catch (error) {
      setTestResult({ success: false, message: String(error) || 'YouTube connection test failed' });
    } finally {
      setTestingYouTube(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Reddit API Section */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Reddit API Credentials</h2>
        <p className="text-sm text-gray-500 mb-4">
          Create a Reddit app at{' '}
          <a
            href="https://www.reddit.com/prefs/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            reddit.com/prefs/apps
          </a>{' '}
          (select "script" type)
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">Client ID</label>
            <input
              type="text"
              value={redditClientId}
              onChange={e => setRedditClientId(e.target.value)}
              placeholder="Your Reddit app client ID"
              className="input"
            />
          </div>

          <div>
            <label className="label">Client Secret</label>
            <input
              type="password"
              value={redditClientSecret}
              onChange={e => setRedditClientSecret(e.target.value)}
              placeholder="Your Reddit app client secret"
              className="input"
            />
          </div>

          <div>
            <label className="label">Reddit Username</label>
            <input
              type="text"
              value={redditUsername}
              onChange={e => setRedditUsername(e.target.value)}
              placeholder="Your Reddit username"
              className="input"
            />
          </div>

          <div>
            <label className="label">Reddit Password</label>
            <input
              type="password"
              value={redditPassword}
              onChange={e => setRedditPassword(e.target.value)}
              placeholder="Your Reddit password"
              className="input"
            />
          </div>

          <button
            onClick={handleTestRedditConnection}
            disabled={testingReddit || !redditClientId || !redditClientSecret}
            className="btn btn-secondary disabled:opacity-50"
          >
            {testingReddit ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* X API Section */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">X (Twitter) API Credentials</h2>
        <p className="text-sm text-gray-500 mb-4">
          Get your Bearer Token from the{' '}
          <a
            href="https://developer.twitter.com/en/portal/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            Twitter Developer Portal
          </a>
          . Basic tier ($100/mo) recommended for meaningful data collection.
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">Bearer Token</label>
            <input
              type="password"
              value={xBearerToken}
              onChange={e => setXBearerToken(e.target.value)}
              placeholder="Your X API Bearer Token"
              className="input"
            />
          </div>

          <div>
            <label className="label">Search Queries</label>
            <input
              type="text"
              value={xQueries}
              onChange={e => setXQueries(e.target.value)}
              placeholder="bitcoin, AI startups, side hustle"
              className="input"
            />
            <p className="text-sm text-gray-500 mt-1">
              Comma-separated topics to search for on X
            </p>
          </div>

          <button
            onClick={handleTestXConnection}
            disabled={testingX || !xBearerToken}
            className="btn btn-secondary disabled:opacity-50"
          >
            {testingX ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* YouTube API Section */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">YouTube API Credentials</h2>
        <p className="text-sm text-gray-500 mb-4">
          Get your API Key from the{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            Google Cloud Console
          </a>
          . Enable the YouTube Data API v3. Free tier includes 10,000 units/day.
        </p>

        <div className="space-y-4">
          <div>
            <label className="label">API Key</label>
            <input
              type="password"
              value={youtubeApiKey}
              onChange={e => setYoutubeApiKey(e.target.value)}
              placeholder="Your YouTube Data API v3 Key"
              className="input"
            />
          </div>

          <div>
            <label className="label">Search Queries</label>
            <input
              type="text"
              value={youtubeQueries}
              onChange={e => setYoutubeQueries(e.target.value)}
              placeholder="bitcoin tutorial, AI explained, side hustle ideas"
              className="input"
            />
            <p className="text-sm text-gray-500 mt-1">
              Comma-separated topics to search for on YouTube
            </p>
          </div>

          <button
            onClick={handleTestYouTubeConnection}
            disabled={testingYouTube || !youtubeApiKey}
            className="btn btn-secondary disabled:opacity-50"
          >
            {testingYouTube ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* Collection Settings */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Collection Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="label">Subreddits to Monitor</label>
            <input
              type="text"
              value={subreddits}
              onChange={e => setSubreddits(e.target.value)}
              placeholder="cryptocurrency, wallstreetbets, stocks"
              className="input"
            />
            <p className="text-sm text-gray-500 mt-1">
              Comma-separated list of subreddit names (without r/)
            </p>
          </div>

          <div>
            <label className="label">Collection Interval (minutes)</label>
            <input
              type="number"
              value={collectionInterval}
              onChange={e => setCollectionInterval(parseInt(e.target.value) || 30)}
              min={5}
              max={1440}
              className="input w-32"
            />
            <p className="text-sm text-gray-500 mt-1">
              How often to collect new data (minimum 5 minutes)
            </p>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {testResult && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="btn btn-primary disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}

export default Settings;
