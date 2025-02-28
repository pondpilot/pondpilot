// globals.d.ts

declare const __VERSION__: string;
declare class FileSystemObserver {
  constructor(callback: FileSystemObserverCallback);

  observe(handle: FileSystemHandle, options?: FileSystemObserverObserveOptions): Promise<void>;

  unobserve(handle: FileSystemHandle): void;

  disconnect(): void;
}

type FileSystemObserverCallback = (
  records: FileSystemChangeRecord[],

  observer: FileSystemObserver,
) => void;

type FileSystemChangeType =
  | 'appeared'
  | 'disappeared'
  | 'modified'
  | 'moved'
  | 'unknown'
  | 'errored';

interface FileSystemObserverObserveOptions {
  recursive?: boolean;
}

interface FileSystemChangeRecord {
  readonly root: FileSystemHandle;

  readonly changedHandle: FileSystemHandle;

  readonly relativePathComponents: readonly string[];

  readonly type: FileSystemChangeType;

  readonly relativePathMovedFrom?: readonly string[];
}
