/// <reference types="vite/client" />

declare module '*.module.css';

interface ImportMetaEnv {
  readonly VITE_ENABLE_ANALYTICS_PANEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
