/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional POST endpoint for anonymous input logging — see vendor/ninebark-engine/inputLogger.ts. */
  readonly VITE_INPUT_LOG_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
