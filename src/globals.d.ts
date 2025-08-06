// globals.d.ts

declare const __VERSION__: string;
declare const __INTEGRATION_TEST__: boolean;

interface HTMLInputElement {
  webkitdirectory: boolean;
  directory: boolean;
}

interface File {
  webkitRelativePath?: string;
}

// Tauri API types
interface Window {
  __TAURI__?: {
    os: {
      platform: () => Promise<string>;
    };
    [key: string]: any;
  };
  __TAURI_INTERNALS__?: any;
}
