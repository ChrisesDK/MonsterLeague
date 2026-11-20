/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Spawn service base URL, set at build time (empty = map shows "not configured"). */
  readonly VITE_SPAWN_SERVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
