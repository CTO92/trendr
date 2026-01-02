import React, { useEffect, useState } from 'react';
import { api, AppSettings, RedditCredentials } from '../api';

function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form state
  const [redditClientId, setRedditClientId] = useState('');
  const [redditClientSecret, setRedditClientSecret] = useState('');
  const [redditUsername, setRedditUsername] = useState('');
  const [redditPassword, setRedditPassword] = useState('');
  const [subreddits, setSubreddits] = useState('');
  const [collectionInterval, setCollectionInterval] = useState(30);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);

      // Populate form
      if (data.reddit) {
        setRedditClientId(data.reddit.clientId);
        setRedditClientSecret(data.reddit.clientSecret);
        setRedditUsername(data.reddit.username);
        setRedditPassword(data.reddit.password);
      }
      setSubreddits(data.subreddits.join(', '));
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

      const subredditList = subreddits
        .split(',')
        .map(s => s.trim().toLowerCase().replace(/^r\//, ''))
        .filter(s => s.length > 0);

      await api.saveSettings({
        reddit,
        subreddits: subredditList,
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

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);

    try {
      // Save credentials first
      await handleSave();

      const success = await api.testRedditConnection();

      if (success) {
        setTestResult({ success: true, message: 'Connection successful! Reddit API is working.' });
      } else {
        setTestResult({
          success: false,
          message: 'Connection failed. Please check your credentials.',
        });
      }
    } catch (error) {
      setTestResult({ success: false, message: String(error) || 'Connection test failed' });
    } finally {
      setTesting(false);
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
            onClick={handleTestConnection}
            disabled={testing || !redditClientId || !redditClientSecret}
            className="btn btn-secondary disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
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
