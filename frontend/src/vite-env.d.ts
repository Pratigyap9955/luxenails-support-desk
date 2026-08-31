/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute base URL of the API when it is on a different origin. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
