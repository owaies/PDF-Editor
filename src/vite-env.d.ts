/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PDF_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
