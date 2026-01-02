import React, { useEffect, useState } from 'react';
import { api, DashboardStats, CollectionStatus } from '../api';

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [collectionStatus, setCollectionStatus] = useState<CollectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [statsData, statusData] = await Promise.all([
        api.getDashboardStats(),
        api.getCollectionStatus(),
      ]);
      setStats(statsData);
      setCollectionStatus(statusData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStatus() {
    try {
      const status = await api.getCollectionStatus();
      setCollectionStatus(status);
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  }

  async function handleCollectNow() {
    setCollecting(true);
    try {
      await api.runCollection();
      await loadData();
    } catch (error) {
      console.error('Collection failed:', error);
    } finally {
      setCollecting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={handleCollectNow}
          disabled={collecting || collectionStatus?.isRunning}
          className="btn btn-primary disabled:opacity-50"
        >
          {collecting || collectionStatus?.isRunning ? 'Collecting...' : 'Collect Now'}
        </button>
      </div>

      {/* Collection Status */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-700 mb-3">Collection Status</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Status:</span>
            <span className={`ml-2 font-medium ${collectionStatus?.isRunning ? 'text-green-600' : 'text-gray-600'}`}>
              {collectionStatus?.isRunning ? 'Running' : 'Idle'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Last Run:</span>
            <span className="ml-2 font-medium text-gray-600">
              {collectionStatus?.lastRunAt
                ? new Date(collectionStatus.lastRunAt).toLocaleString()
                : 'Never'}
            </span>
          </div>
        </div>
        {collectionStatus?.lastError && (
          <div className="mt-3 p-2 bg-red-50 text-red-700 text-sm rounded">
            Error: {collectionStatus.lastError}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Content" value={stats?.totalContent || 0} icon="📄" />
        <StatCard label="Topics" value={stats?.totalTopics || 0} icon="📁" />
        <StatCard label="Creators" value={stats?.totalCreators || 0} icon="👤" />
        <StatCard label="Last 7 Days" value={stats?.contentLast7Days || 0} icon="📈" />
      </div>

      {/* Top Topics */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4">Top Topics</h2>
        {stats?.topTopics && stats.topTopics.length > 0 ? (
          <div className="space-y-3">
            {stats.topTopics.map((topic, index) => (
              <div key={topic.name} className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-6">{index + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">{topic.name}</span>
                    <span className="text-sm text-gray-500">{topic.count} items</span>
                  </div>
                  <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{
                        width: `${Math.min((topic.count / (stats.topTopics[0]?.count || 1)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            No topic data yet. Configure your Reddit credentials in Settings and run a collection.
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
          <div className="text-sm text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
