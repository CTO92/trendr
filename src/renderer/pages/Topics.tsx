import React, { useEffect, useState } from 'react';
import { api, Topic, Content } from '../api';

function Topics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [topicContent, setTopicContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTopics();
  }, []);

  async function loadTopics() {
    setLoading(true);
    try {
      const data = await api.getTopics(100, 0);
      setTopics(data);
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectTopic(topic: Topic) {
    setSelectedTopic(topic);
    try {
      const content = await api.getContentByTopic(topic.id, 20);
      setTopicContent(content);
    } catch (error) {
      console.error('Failed to load topic content:', error);
    }
  }

  const filteredTopics = topics.filter(topic =>
    topic.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-500">Loading topics...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Topics List */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3">Topics</h2>
          <input
            type="text"
            placeholder="Search topics..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input"
          />
        </div>

        <div className="flex-1 overflow-auto">
          {filteredTopics.length > 0 ? (
            filteredTopics.map(topic => (
              <button
                key={topic.id}
                onClick={() => handleSelectTopic(topic)}
                className={`w-full px-4 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selectedTopic?.id === topic.id ? 'bg-primary-50 border-l-2 border-l-primary-500' : ''
                }`}
              >
                <div className="font-medium text-gray-800">{topic.name}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {topic.contentCount || 0} items
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-gray-500 text-sm text-center">
              No topics found
            </div>
          )}
        </div>
      </div>

      {/* Topic Detail */}
      <div className="flex-1 overflow-auto p-6">
        {selectedTopic ? (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{selectedTopic.name}</h1>
            <p className="text-gray-500 mb-6">
              {selectedTopic.contentCount || 0} content items
            </p>

            <h2 className="font-semibold text-gray-700 mb-4">Recent Content</h2>

            {topicContent.length > 0 ? (
              <div className="space-y-4">
                {topicContent.map(content => (
                  <ContentCard key={content.id} content={content} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No content for this topic yet.</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a topic to view details
          </div>
        )}
      </div>
    </div>
  );
}

function ContentCard({ content }: { content: Content }) {
  const text = content.textContent || '';
  const preview = text.length > 300 ? text.substring(0, 300) + '...' : text;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded">
          {content.platform}
        </span>
        <span className="text-sm text-gray-500">
          {content.publishedAt
            ? new Date(content.publishedAt).toLocaleDateString()
            : 'Unknown date'}
        </span>
      </div>

      <p className="text-gray-700 text-sm leading-relaxed">{preview}</p>

      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
        <span>👍 {content.engagementLikes}</span>
        <span>💬 {content.engagementComments}</span>
      </div>
    </div>
  );
}

export default Topics;
