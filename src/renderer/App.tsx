import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Topics from './pages/Topics';
import Settings from './pages/Settings';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/topics', label: 'Topics', icon: '📁' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

function App() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-900 text-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">Trendr</h1>
          <p className="text-xs text-gray-400 mt-1">Attention Flow Tracker</p>
        </div>

        <div className="flex-1 py-4">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white border-r-2 border-primary-500'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
          v0.1.0 - Phase 1
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
