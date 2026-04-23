#!/usr/bin/env node
import { Command } from 'commander';
import { syncTwitterBookmarks } from './bookmarks.js';
import { getBookmarkStatusView, formatBookmarkStatus } from './bookmarks-service.js';
import { runTwitterOAuthFlow } from './xauth.js';
import { syncBookmarksGraphQL } from './graphql-bookmarks.js';
import type { SyncProgress } from './types.js';
import { fetchBookmarkMediaBatch } from './bookmark-media.js';
import {
  buildIndex,
  searchBookmarks,
  formatSearchResults,
  getStats,
  classifyAndRebuild,
  getCategoryCounts,
  sampleByCategory,
  getDomainCounts,
  listBookmarks,
  getBookmarkById,
} from './bookmarks-db.js';
import { formatClassificationSummary } from './bookmark-classify.js';
import { classifyWithLlm, classifyDomainsWithLlm, detectAvailableEngines, normalizeEnginePreference } from './bookmark-classify-llm.js';
import { loadChromeSessionConfig } from './config.js';
import { renderViz } from './bookmarks-viz.js';
import { dataDir, ensureDataDir, isFirstRun, twitterBookmarksIndexPath } from './paths.js';
import fs from 'node:fs';

// ── Helpers ─────────────────────────────────────────────────────────────────

const SPINNER = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
let spinnerIdx = 0;

function renderProgress(status: SyncProgress, startTime: number): void {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const spin = SPINNER[spinnerIdx++ % SPINNER.length];
  const line = `  ${spin} Syncing bookmarks...  ${status.newAdded} new  \u2502  page ${status.page}  \u2502  ${elapsed}s`;
  process.stderr.write(`\r\x1b[K${line}`);
}

const FRIENDLY_STOP_REASONS: Record<string, string> = {
  'caught up to newest stored bookmark': 'All caught up \u2014 no new bookmarks since last sync.',
  'no new bookmarks (stale)': 'Sync complete \u2014 reached the end of new bookmarks.',
  'end of bookmarks': 'Sync complete \u2014 all bookmarks fetched.',
  'max runtime reached': 'Paused after 30 minutes. Run again to continue.',
  'max pages reached': 'Paused after reaching page limit. Run again to continue.',
  'target additions reached': 'Reached target bookmark count.',
};

function friendlyStopReason(raw?: string): string {
  if (!raw) return 'Sync complete.';
  return FRIENDLY_STOP_REASONS[raw] ?? `Sync complete \u2014 ${raw}`;
}

const LOGO = `
   \x1b[2m\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\x1b[0m
   \x1b[2m\u2502\x1b[0m   \x1b[1mFieldTheory for Windows\x1b[0m  \x1b[2m\u2502\x1b[0m
   \x1b[2m\u2502\x1b[0m      \x1b[2mby Shango Bashi\x1b[0m      \x1b[2m\u2502\x1b[0m
   \x1b[2m\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\x1b[0m`;

function selectedEngine(optionValue?: string): 'auto' | 'claude' | 'codex' {
  try {
    return normalizeEnginePreference(optionValue);
  } catch {
    return 'auto';
  }
}

export function showWelcome(): void {
  console.log(LOGO);
  console.log(`
  Save a local copy of your X/Twitter bookmarks. Search them,
  classify them, and make them available to Codex or any
  shell-access agent on Windows.
  Your data never leaves your machine.

  Get started:

    1. Open Google Chrome or Brave Browser and log into x.com
    2. Run: ftx sync

  Data will be stored at: ${dataDir()}
`);
}

export async function showDashboard(): Promise<void> {
  console.log(LOGO);
  const view = await getBookmarkStatusView();
  const ago = view.lastUpdated ? timeAgo(view.lastUpdated) : 'never';
  console.log(`
  \x1b[1m${view.bookmarkCount.toLocaleString()}\x1b[0m bookmarks  \x1b[2m\u2502\x1b[0m  last synced \x1b[1m${ago}\x1b[0m  \x1b[2m\u2502\x1b[0m  ${dataDir()}
`);

  if (fs.existsSync(twitterBookmarksIndexPath())) {
    const counts = await getCategoryCounts();
    const cats = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (cats.length > 0) {
      const catLine = cats.map(([c, n]) => `${c} (${n})`).join(' \u00b7 ');
      console.log(`  \x1b[2m${catLine}\x1b[0m`);
    }
  }

  console.log(`
  \x1b[2mSync now:\x1b[0m     ftx sync
  \x1b[2mSearch:\x1b[0m       ftx search "query"
  \x1b[2mExplore:\x1b[0m      ftx viz
  \x1b[2mCheck setup:\x1b[0m  ftx doctor
  \x1b[2mAll commands:\x1b[0m  ftx --help
`);
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function showSyncWelcome(): void {
  console.log(`
  Make sure Google Chrome or Brave Browser is open and logged into x.com.
  Your browser session is used to authenticate \u2014 no passwords
  are stored or transmitted. On Windows, close Chrome or Brave before
  syncing if the cookies database is locked.
`);
}

/** Check that bookmarks have been synced. Returns true if data exists. */
function requireData(): boolean {
  if (isFirstRun()) {
    console.log(`
  No bookmarks synced yet.

  Get started:

    1. Open Google Chrome or Brave Browser and log into x.com
    2. Run: ftx sync
`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

/** Check that the search index exists. Returns true if it does. */
function requireIndex(): boolean {
  if (!requireData()) return false;
  if (!fs.existsSync(twitterBookmarksIndexPath())) {
    console.log(`
  Search index not built yet.

  Run: ftx index
`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

/** Wrap an async action with graceful error handling. */
function safe<TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`\n  Error: ${msg}\n`);
      process.exitCode = 1;
    }
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function buildCli() {
  const program = new Command();

  async function rebuildIndex(added: number): Promise<number> {
    if (added <= 0) return 0;
    process.stderr.write('  Building search index...\n');
    const idx = await buildIndex();
    process.stderr.write(`  \u2713 ${idx.recordCount} bookmarks indexed (${idx.newRecords} new)\n`);
    return idx.newRecords;
  }

  async function classifyNew(engine: 'auto' | 'claude' | 'codex' = 'auto'): Promise<void> {
    const start = Date.now();
    process.stderr.write('  Classifying new bookmarks (categories)...\n');
    const catResult = await classifyWithLlm({
      engine,
      onBatch: (done: number, total: number) => {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const elapsed = Math.round((Date.now() - start) / 1000);
        process.stderr.write(`  Categories: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
      },
    });
    if (catResult.classified > 0) {
      process.stderr.write(`  \u2713 ${catResult.classified} categorized\n`);
    }

    const domStart = Date.now();
    process.stderr.write('  Classifying new bookmarks (domains)...\n');
    const domResult = await classifyDomainsWithLlm({
      all: false,
      engine,
      onBatch: (done: number, total: number) => {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const elapsed = Math.round((Date.now() - domStart) / 1000);
        process.stderr.write(`  Domains: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
      },
    });
    if (domResult.classified > 0) {
      process.stderr.write(`  \u2713 ${domResult.classified} domains assigned\n`);
    }
  }

  program
    .name('ftx')
    .description('FieldTheory for Windows by Shango Bashi. Sync, search, classify, and explore X/Twitter bookmarks locally.')
    .version('0.4.15')
    .showHelpAfterError()
    .hook('preAction', () => {
      console.log(LOGO);
    });

  // ── sync ────────────────────────────────────────────────────────────────

  program
    .command('sync')
    .description('Sync bookmarks from X into your local database')
    .option('--api', 'Use OAuth v2 API instead of browser session', false)
    .option('--incremental', 'Incremental sync (only fetch new bookmarks since last sync)', false)
    .option('--full', 'Full crawl (deprecated: this is now the default)', false)
    .option('--classify', 'Classify new bookmarks with LLM after syncing', false)
    .option('--engine <engine>', 'Classification engine: auto, codex, claude', 'auto')
    .option('--max-pages <n>', 'Max pages to fetch', (v: string) => Number(v), 500)
    .option('--target-adds <n>', 'Stop after N new bookmarks', (v: string) => Number(v))
    .option('--delay-ms <n>', 'Delay between requests in ms (default: 150)', (v: string) => Number(v), 150)
    .option('--max-minutes <n>', 'Max runtime in minutes', (v: string) => Number(v), 30)
    .option('--prefetch <n>', 'Pages to prefetch ahead (0 = disable pipeline)', (v: string) => Number(v), 1)
    .option('--chrome-user-data-dir <path>', 'Chrome or Brave user-data directory')
    .option('--chrome-profile-directory <name>', 'Browser profile name')
    .option('--csrf-token <token>', 'Direct CSRF token override (skips browser cookie extraction)')
    .option('--cookie-header <header>', 'Direct cookie header override (used with --csrf-token)')
    .action(async (options) => {
      const firstRun = isFirstRun();
      if (firstRun) showSyncWelcome();
      ensureDataDir();
      const engine = selectedEngine(options.engine);

      try {
        const useApi = Boolean(options.api);
        const mode = Boolean(options.full) ? 'full' : 'incremental';

        if (useApi) {
          const result = await syncTwitterBookmarks(mode, {
            targetAdds: typeof options.targetAdds === 'number' && !Number.isNaN(options.targetAdds) ? options.targetAdds : undefined,
          });
          console.log(`\n  \u2713 ${result.added} new bookmarks synced (${result.totalBookmarks} total)`);
          console.log(`  \u2713 Data: ${dataDir()}\n`);
          const newCount = await rebuildIndex(result.added);
          if (options.classify && newCount > 0) {
            await classifyNew(engine);
          }
        } else {
          const startTime = Date.now();
          const result = await syncBookmarksGraphQL({
            incremental: Boolean(options.incremental),
            maxPages: Number(options.maxPages) || 500,
            targetAdds: typeof options.targetAdds === 'number' && !Number.isNaN(options.targetAdds) ? options.targetAdds : undefined,
            delayMs: Number(options.delayMs) || 150,
            maxMinutes: Number(options.maxMinutes) || 30,
            prefetchPages: typeof options.prefetch === 'number' ? options.prefetch : 1,
            chromeUserDataDir: options.chromeUserDataDir ? String(options.chromeUserDataDir) : undefined,
            chromeProfileDirectory: options.chromeProfileDirectory ? String(options.chromeProfileDirectory) : undefined,
            csrfToken: options.csrfToken ? String(options.csrfToken) : undefined,
            cookieHeader: options.cookieHeader ? String(options.cookieHeader) : undefined,
            onProgress: (status: SyncProgress) => {
              renderProgress(status, startTime);
              if (status.done) process.stderr.write('\n');
            },
          });

          console.log(`\n  \u2713 ${result.added} new bookmarks synced (${result.totalBookmarks} total)`);
          console.log(`  ${friendlyStopReason(result.stopReason)}`);
          console.log(`  \u2713 Data: ${dataDir()}\n`);

          const newCount = await rebuildIndex(result.added);
          if (options.classify && newCount > 0) {
            await classifyNew(engine);
          }
        }

        if (firstRun) {
          console.log(`\n  Next steps:`);
          console.log(`        ftx classify              Classify by category and domain (LLM)`);
          console.log(`        ftx classify --regex      Classify by category (simple)`);
          console.log(`\n  Explore:`);
          console.log(`        ftx search "machine learning"`);
          console.log(`        ftx viz`);
          console.log(`        ftx categories`);
          console.log(`\n  Ask Codex to use the ftx CLI to search and explore your bookmarks.`);
          console.log(`  FieldTheory for Windows by Shango Bashi.\n`);
        }
      } catch (err) {
        const msg = (err as Error).message;
        if (firstRun && (msg.includes('cookie') || msg.includes('Cookie') || msg.includes('Keychain'))) {
          console.log(`
  Couldn't connect to your Chrome session.

  To sync your bookmarks:

    1. Open Google Chrome or Brave Browser
    2. Go to x.com and make sure you're logged in
    3. Close the browser completely
    4. Run: ftx sync

  If you use multiple browser profiles, specify which one:
    ftx sync --chrome-profile-directory "Profile 1"
`);
        } else {
          console.error(`\n  Error: ${msg}\n`);
        }
        process.exitCode = 1;
      }
    });

  // ── search ──────────────────────────────────────────────────────────────

  program
    .command('search')
    .description('Full-text search across bookmarks')
    .argument('<query>', 'Search query (supports FTS5 syntax: AND, OR, NOT, "exact phrase")')
    .option('--author <handle>', 'Filter by author handle')
    .option('--after <date>', 'Bookmarks posted after this date (YYYY-MM-DD)')
    .option('--before <date>', 'Bookmarks posted before this date (YYYY-MM-DD)')
    .option('--limit <n>', 'Max results', (v: string) => Number(v), 20)
    .action(safe(async (query: string, options) => {
      if (!requireIndex()) return;
      const results = await searchBookmarks({
        query,
        author: options.author ? String(options.author) : undefined,
        after: options.after ? String(options.after) : undefined,
        before: options.before ? String(options.before) : undefined,
        limit: Number(options.limit) || 20,
      });
      console.log(formatSearchResults(results));
    }));

  // ── list ────────────────────────────────────────────────────────────────

  program
    .command('list')
    .description('List bookmarks with filters')
    .option('--query <query>', 'Text query (FTS5 syntax)')
    .option('--author <handle>', 'Filter by author handle')
    .option('--after <date>', 'Posted after (YYYY-MM-DD)')
    .option('--before <date>', 'Posted before (YYYY-MM-DD)')
    .option('--category <category>', 'Filter by category')
    .option('--domain <domain>', 'Filter by domain')
    .option('--limit <n>', 'Max results', (v: string) => Number(v), 30)
    .option('--offset <n>', 'Offset into results', (v: string) => Number(v), 0)
    .option('--json', 'JSON output')
    .action(safe(async (options) => {
      if (!requireIndex()) return;
      const items = await listBookmarks({
        query: options.query ? String(options.query) : undefined,
        author: options.author ? String(options.author) : undefined,
        after: options.after ? String(options.after) : undefined,
        before: options.before ? String(options.before) : undefined,
        category: options.category ? String(options.category) : undefined,
        domain: options.domain ? String(options.domain) : undefined,
        limit: Number(options.limit) || 30,
        offset: Number(options.offset) || 0,
      });
      if (options.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      for (const item of items) {
        const tags = [item.primaryCategory, item.primaryDomain].filter(Boolean).join(' \u00b7 ');
        const summary = item.text.length > 120 ? `${item.text.slice(0, 117)}...` : item.text;
        console.log(`${item.id}  ${item.authorHandle ? `@${item.authorHandle}` : '@?'}  ${item.postedAt?.slice(0, 10) ?? '?'}${tags ? `  ${tags}` : ''}`);
        console.log(`  ${summary}`);
        console.log(`  ${item.url}`);
        console.log();
      }
    }));

  // ── show ─────────────────────────────────────────────────────────────────

  program
    .command('show')
    .description('Show one bookmark in detail')
    .argument('<id>', 'Bookmark id')
    .option('--json', 'JSON output')
    .action(safe(async (id: string, options) => {
      if (!requireIndex()) return;
      const item = await getBookmarkById(String(id));
      if (!item) {
        console.log(`  Bookmark not found: ${String(id)}`);
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(item, null, 2));
        return;
      }
      console.log(`${item.id} \u00b7 ${item.authorHandle ? `@${item.authorHandle}` : '@?'}`);
      console.log(item.url);
      console.log(item.text);
      if (item.links.length) console.log(`links: ${item.links.join(', ')}`);
      if (item.categories) console.log(`categories: ${item.categories}`);
      if (item.domains) console.log(`domains: ${item.domains}`);
    }));

  // ── stats ───────────────────────────────────────────────────────────────

  program
    .command('stats')
    .description('Aggregate statistics from your bookmarks')
    .action(safe(async () => {
      if (!requireIndex()) return;
      const stats = await getStats();
      console.log(`Bookmarks: ${stats.totalBookmarks}`);
      console.log(`Unique authors: ${stats.uniqueAuthors}`);
      console.log(`Date range: ${stats.dateRange.earliest?.slice(0, 10) ?? '?'} to ${stats.dateRange.latest?.slice(0, 10) ?? '?'}`);
      console.log(`\nTop authors:`);
      for (const a of stats.topAuthors) console.log(`  @${a.handle}: ${a.count}`);
      console.log(`\nLanguages:`);
      for (const l of stats.languageBreakdown) console.log(`  ${l.language}: ${l.count}`);
    }));

  // ── viz ─────────────────────────────────────────────────────────────────

  program
    .command('viz')
    .description('Visual dashboard of your bookmarking patterns')
    .action(safe(async () => {
      if (!requireIndex()) return;
      console.log(await renderViz());
    }));

  // ── classify ────────────────────────────────────────────────────────────

  program
    .command('classify')
    .description('Classify bookmarks by category and domain using Codex or Claude')
    .option('--regex', 'Use simple regex classification instead of LLM')
    .option('--engine <engine>', 'LLM engine: auto, codex, claude', 'auto')
    .action(safe(async (options) => {
      if (!requireData()) return;
      if (options.regex) {
        process.stderr.write('Classifying bookmarks (regex)...\n');
        const result = await classifyAndRebuild();
        console.log(`Indexed ${result.recordCount} bookmarks \u2192 ${result.dbPath}`);
        console.log(formatClassificationSummary(result.summary));
      } else {
        let catStart = Date.now();
        process.stderr.write('Classifying categories with LLM (batches of 50, ~2 min per batch)...\n');
        const catResult = await classifyWithLlm({
          engine: selectedEngine(options.engine),
          onBatch: (done: number, total: number) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const elapsed = Math.round((Date.now() - catStart) / 1000);
            process.stderr.write(`  Categories: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
          },
        });
        console.log(`\nEngine: ${catResult.engine}`);
        console.log(`Categories: ${catResult.classified}/${catResult.totalUnclassified} classified`);

        let domStart = Date.now();
        process.stderr.write('\nClassifying domains with LLM (batches of 50, ~2 min per batch)...\n');
        const domResult = await classifyDomainsWithLlm({
          all: false,
          engine: selectedEngine(options.engine),
          onBatch: (done: number, total: number) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const elapsed = Math.round((Date.now() - domStart) / 1000);
            process.stderr.write(`  Domains: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
          },
        });
        console.log(`\nDomains: ${domResult.classified}/${domResult.totalUnclassified} classified`);
      }
    }));

  // ── classify-domains ────────────────────────────────────────────────────

  program
    .command('classify-domains')
    .description('Classify bookmarks by subject domain using LLM (ai, finance, etc.)')
    .option('--all', 'Re-classify all bookmarks, not just missing')
    .option('--engine <engine>', 'LLM engine: auto, codex, claude', 'auto')
    .action(safe(async (options) => {
      if (!requireData()) return;
      const start = Date.now();
      process.stderr.write('Classifying bookmark domains with LLM (batches of 50, ~2 min per batch)...\n');
      const result = await classifyDomainsWithLlm({
        all: options.all ?? false,
        engine: selectedEngine(options.engine),
        onBatch: (done: number, total: number) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const elapsed = Math.round((Date.now() - start) / 1000);
          process.stderr.write(`  Domains: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
        },
      });
      console.log(`\nDomains: ${result.classified}/${result.totalUnclassified} classified`);
    }));

  // ── categories ──────────────────────────────────────────────────────────

  program
    .command('categories')
    .description('Show category distribution')
    .action(safe(async () => {
      if (!requireIndex()) return;
      const counts = await getCategoryCounts();
      if (Object.keys(counts).length === 0) {
        console.log('  No categories found. Run: ftx classify');
        return;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      for (const [cat, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        const pct = ((count / total) * 100).toFixed(1);
        console.log(`  ${cat.padEnd(14)} ${String(count).padStart(5)}  (${pct}%)`);
      }
    }));

  // ── domains ─────────────────────────────────────────────────────────────

  program
    .command('domains')
    .description('Show domain distribution')
    .action(safe(async () => {
      if (!requireIndex()) return;
      const counts = await getDomainCounts();
      if (Object.keys(counts).length === 0) {
        console.log('  No domains found. Run: ftx classify-domains');
        return;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      for (const [dom, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        const pct = ((count / total) * 100).toFixed(1);
        console.log(`  ${dom.padEnd(20)} ${String(count).padStart(5)}  (${pct}%)`);
      }
    }));

  // ── index ───────────────────────────────────────────────────────────────

  program
    .command('index')
    .description('Rebuild the SQLite search index from the JSONL cache')
    .option('--force', 'Drop and rebuild from scratch (loses classifications)')
    .action(safe(async (options) => {
      if (!requireData()) return;
      process.stderr.write('Building search index...\n');
      const result = await buildIndex({ force: Boolean(options.force) });
      console.log(`Indexed ${result.recordCount} bookmarks (${result.newRecords} new) \u2192 ${result.dbPath}`);
    }));

  // ── auth ────────────────────────────────────────────────────────────────

  program
    .command('auth')
    .description('Set up OAuth for API-based sync (optional, needed for ftx sync --api)')
    .action(safe(async () => {
      const result = await runTwitterOAuthFlow();
      console.log(`Saved token to ${result.tokenPath}`);
      if (result.scope) console.log(`Scope: ${result.scope}`);
    }));

  // ── status ──────────────────────────────────────────────────────────────

  program
    .command('status')
    .description('Show sync status and data location')
    .action(safe(async () => {
      if (!requireData()) return;
      const view = await getBookmarkStatusView();
      console.log(formatBookmarkStatus(view));
    }));

  // ── path ────────────────────────────────────────────────────────────────

  program
    .command('path')
    .description('Print the data directory path')
    .action(() => { console.log(dataDir()); });

  program
    .command('doctor')
    .description('Check local Windows, Chrome/Brave, and LLM prerequisites')
    .action(safe(async () => {
      const engines = detectAvailableEngines();
      let browserDir = 'not detected';
      let browserName = 'none';
      let browserStatus = 'unavailable';

      try {
        const config = loadChromeSessionConfig();
        browserDir = config.chromeUserDataDir;
        browserName = config.browser;
        browserStatus = fs.existsSync(config.chromeUserDataDir)
          ? `ok (${config.chromeProfileDirectory ?? 'Default'})`
          : 'configured path not found';
      } catch (error) {
        browserStatus = (error as Error).message.split('\n')[0] ?? 'unavailable';
      }

      console.log(`Platform: ${process.platform}`);
      console.log(`Node: ${process.version}`);
      console.log(`Data directory: ${dataDir()}`);
      console.log(`Browser detected: ${browserName}`);
      console.log(`Browser user data: ${browserDir}`);
      console.log(`Browser status: ${browserStatus}`);
      console.log(`LLM engines: ${engines.length ? engines.join(', ') : 'none found'}`);
      console.log('Project: FieldTheory for Windows by Shango Bashi');
    }));

  // ── sample ──────────────────────────────────────────────────────────────

  program
    .command('sample')
    .description('Sample bookmarks by category')
    .argument('<category>', 'Category: tool, security, technique, launch, research, opinion, commerce')
    .option('--limit <n>', 'Max results', (v: string) => Number(v), 10)
    .action(safe(async (category: string, options) => {
      if (!requireIndex()) return;
      const results = await sampleByCategory(category, Number(options.limit) || 10);
      if (results.length === 0) {
        console.log(`  No bookmarks found with category "${category}". Run: ftx classify`);
        return;
      }
      for (const r of results) {
        const text = r.text.length > 120 ? r.text.slice(0, 120) + '...' : r.text;
        console.log(`[@${r.authorHandle ?? '?'}] ${text}`);
        console.log(`  ${r.url}  [${r.categories}]`);
        if (r.githubUrls) console.log(`  github: ${r.githubUrls}`);
        console.log();
      }
    }));

  // ── fetch-media ─────────────────────────────────────────────────────────

  program
    .command('fetch-media')
    .description('Download media assets for bookmarks (static images only)')
    .option('--limit <n>', 'Max bookmarks to process', (v: string) => Number(v), 100)
    .option('--max-bytes <n>', 'Per-asset byte limit', (v: string) => Number(v), 50 * 1024 * 1024)
    .action(safe(async (options) => {
      if (!requireData()) return;
      const result = await fetchBookmarkMediaBatch({
        limit: Number(options.limit) || 100,
        maxBytes: Number(options.maxBytes) || 50 * 1024 * 1024,
      });
      console.log(JSON.stringify(result, null, 2));
    }));

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildCli().parseAsync(process.argv);
}
