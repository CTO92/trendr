/// <reference types="vite/client" />

interface Window {
  electronAPI: import('../main/preload').ElectronAPI;
}
