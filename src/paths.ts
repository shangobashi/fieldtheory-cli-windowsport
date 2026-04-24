import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { restrictWindowsAcl } from './windows-acl.js';

export const SENSITIVE_PATH_MODE = 0o700;

export function dataDir(): string {
  const override = process.env.FTX_DATA_DIR;
  if (override) return override;
  return path.join(os.homedir(), '.ftx-bookmarks');
}

export function ensureSensitivePathSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: SENSITIVE_PATH_MODE });
  }

  if (process.platform === 'win32') {
    try {
      restrictWindowsAcl(dir, true);
    } catch (error) {
      process.stderr.write(
        `Warning: could not restrict ACL on sensitive directory: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
    }
  }
}

export function ensureDataDir(): string {
  const dir = dataDir();
  ensureSensitivePathSync(dir);
  return dir;
}

export function twitterBookmarksCachePath(): string {
  return path.join(dataDir(), 'bookmarks.jsonl');
}

export function twitterBookmarksMetaPath(): string {
  return path.join(dataDir(), 'bookmarks-meta.json');
}

export function twitterOauthTokenPath(): string {
  return path.join(dataDir(), 'oauth-token.json');
}

export function twitterBackfillStatePath(): string {
  return path.join(dataDir(), 'bookmarks-backfill-state.json');
}

export function bookmarkMediaDir(): string {
  return path.join(dataDir(), 'media');
}

export function bookmarkMediaManifestPath(): string {
  return path.join(dataDir(), 'media-manifest.json');
}

export function twitterBookmarksIndexPath(): string {
  return path.join(dataDir(), 'bookmarks.db');
}

export function isFirstRun(): boolean {
  return !fs.existsSync(twitterBookmarksCachePath());
}
