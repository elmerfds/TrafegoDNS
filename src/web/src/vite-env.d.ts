/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}