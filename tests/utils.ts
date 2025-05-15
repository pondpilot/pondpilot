import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { Page } from '@playwright/test';

export type PathInfo = {
  normalizedAsPosix: string;
  parts: string[];
  dirs: string[];
  basename: string;
};

export function parsePath(s: string): PathInfo {
  const normalized = path.normalize(s);
  const normalizedAsPosix = normalized.replace(/\\/g, '/');
  const parts = normalizedAsPosix.split('/');
  const dirs = parts.slice(0, -1);
  const basename = parts[parts.length - 1];
  return {
    normalizedAsPosix,
    parts,
    dirs,
    basename,
  };
}

export function createDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function createFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  createDir(dir);
  writeFileSync(filePath, content, { flush: true });
}

export function getClipboardContent(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}
