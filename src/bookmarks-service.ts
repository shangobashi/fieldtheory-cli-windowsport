import { getTwitterBookmarksStatus } from './bookmarks.js';
import { loadTwitterOAuthToken } from './xauth.js';

interface BookmarkStatusView {
  connected: boolean;
  bookmarkCount: number;
  lastUpdated: string | null;
  mode: string;
  cachePath: string;
}

export async function getBookmarkStatusView(): Promise<BookmarkStatusView> {
  const token = await loadTwitterOAuthToken();
  const status = await getTwitterBookmarksStatus();
  return {
    connected: Boolean(token?.access_token),
    bookmarkCount: status.totalBookmarks,
    lastUpdated: status.lastIncrementalSyncAt ?? status.lastFullSyncAt ?? null,
    mode: token?.access_token ? 'Incremental by default (GraphQL + API available)' : 'Incremental by default (GraphQL)',
    cachePath: status.cachePath,
  };
}

export function formatBookmarkStatus(view: BookmarkStatusView): string {
  return [
    'Bookmarks',
    `  bookmarks: ${view.bookmarkCount}`,
    `  last updated: ${view.lastUpdated ?? 'never'}`,
    `  sync mode: ${view.mode}`,
    `  cache: ${view.cachePath}`,
  ].join('\n');
}

export function formatBookmarkSummary(view: BookmarkStatusView): string {
  return `bookmarks=${view.bookmarkCount} updated=${view.lastUpdated ?? 'never'} mode="${view.mode}"`;
}
