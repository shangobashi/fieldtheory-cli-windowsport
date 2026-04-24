/**

 * LLM-based bookmark classification using either `codex exec` or `claude -p`.

 * The default preference order is Codex first, then Claude.

 */

import { openDb, saveDb } from './db.js';

import { twitterBookmarksIndexPath } from './paths.js';

import { resolveCommandPath } from './command-path.js';

import { invokeClaudeClassification, invokeCodexClassification } from './llm-exec.js';

import {

  buildClassificationPayload,

  buildStaticClassificationInstruction,

  ClassificationMode,

  ClassificationRequest,

  NormalizedClassification,

} from './llm-schema.js';

const BATCH_SIZE = 50;

export const LLM_BATCH_BYTE_CEILING = 24_000;

interface UnclassifiedBookmark {

  id: string;

  text: string;

  authorHandle: string | null;

  links: string | null;

}

interface DomainBookmark {

  id: string;

  text: string;

  authorHandle: string | null;

  categories: string | null;

}

type Engine = 'claude' | 'codex';

const ENGINE_ORDER: Engine[] = ['codex', 'claude'];

export function normalizeEnginePreference(value?: string | null): Engine | 'auto' {

  if (!value) return 'auto';

  const normalized = value.trim().toLowerCase();

  if (normalized === 'auto') return 'auto';

  if (normalized === 'codex' || normalized === 'claude') return normalized;

  throw new Error(`Unsupported engine "${value}". Use one of: auto, codex, claude.`);

}

export function detectAvailableEngines(): Engine[] {

  return ENGINE_ORDER.filter((engine) => resolveCommandPath(engine) !== null);

}

function detectEngine(preference: Engine | 'auto' = 'auto'): Engine | null {

  const available = detectAvailableEngines();

  if (preference === 'auto') return available[0] ?? null;

  return available.includes(preference) ? preference : null;

}

function truncateBookmarkText(text: string): string {

  return text.replace(/\s+/g, ' ').trim().slice(0, 300);

}

function buildCategoryRequest(bookmarks: UnclassifiedBookmark[]): ClassificationRequest {

  return {

    mode: 'category',

    items: bookmarks.map((bookmark, index) => ({

      index,

      id: bookmark.id,

      authorHandle: bookmark.authorHandle ?? 'unknown',

      text: truncateBookmarkText(bookmark.text),

      links: bookmark.links ?? null,

    })),

  };

}

function buildDomainRequest(bookmarks: DomainBookmark[]): ClassificationRequest {

  return {

    mode: 'domain',

    items: bookmarks.map((bookmark, index) => ({

      index,

      id: bookmark.id,

      authorHandle: bookmark.authorHandle ?? 'unknown',

      categories: bookmark.categories ?? null,

      text: truncateBookmarkText(bookmark.text),

    })),

  };

}

export function buildCategoryPrompt(bookmarks: UnclassifiedBookmark[]): string {

  const request = buildCategoryRequest(bookmarks);

  return [

    buildStaticClassificationInstruction('category'),

    '',

    `PAYLOAD_JSON=${buildClassificationPayload(request)}`,

  ].join('\n');

}

export function buildDomainPrompt(bookmarks: DomainBookmark[]): string {

  const request = buildDomainRequest(bookmarks);

  return [

    buildStaticClassificationInstruction('domain'),

    '',

    `PAYLOAD_JSON=${buildClassificationPayload(request)}`,

  ].join('\n');

}

function resolveEngineOrThrow(preference?: Engine | 'auto'): Engine {

  const normalized = normalizeEnginePreference(preference ?? process.env.FTX_LLM_ENGINE);

  const engine = detectEngine(normalized);

  if (engine) return engine;

  const available = detectAvailableEngines();

  if (normalized === 'auto') {

    throw new Error(

      'No supported LLM CLI found.\n' +

      'Install one of the following and log in:\n' +

      '  - Codex CLI\n' +

      '  - Claude Code'

    );

  }

  throw new Error(

    `Requested engine "${normalized}" is not available on PATH.\n` +

    `Available engines: ${available.length ? available.join(', ') : 'none'}`

  );

}

interface LlmClassifyResult {

  engine: Engine;

  totalUnclassified: number;

  classified: number;

  failed: number;

  batches: number;

}

interface BatchClassifyOptions {

  engine: Engine;

  mode: ClassificationMode;

  query: string;

  updateStmt: string;

  mapRow: (row: unknown[]) => Record<string, unknown>;

  onBatch?: (done: number, total: number) => void;

}

type ClassificationInvoker = (request: ClassificationRequest) => NormalizedClassification[];

let testInvokers: Partial<Record<Engine, ClassificationInvoker>> = {};

export function __setClassificationInvokersForTests(overrides: Partial<Record<Engine, ClassificationInvoker>> = {}): void {

  testInvokers = overrides;

}

function invokeClassification(engine: Engine, request: ClassificationRequest): NormalizedClassification[] {

  const override = testInvokers[engine];

  if (override) return override(request);

  return engine === 'codex'

    ? invokeCodexClassification(request)

    : invokeClaudeClassification(request);

}

function utf8ByteLength(input: string): number {

  return Buffer.byteLength(input, 'utf-8');

}

function requestBytes(mode: ClassificationMode, items: Record<string, unknown>[]): number {

  return utf8ByteLength(buildClassificationPayload({ mode, items }));

}

export function splitAdaptiveBatches<T extends Record<string, unknown>>(

  mode: ClassificationMode,

  items: T[],

  maxItems: number = BATCH_SIZE,

  byteCeiling: number = LLM_BATCH_BYTE_CEILING,

): T[][] {

  const batches: T[][] = [];

  let cursor = 0;

  while (cursor < items.length) {

    let end = Math.min(cursor + maxItems, items.length);

    while (end > cursor && requestBytes(mode, items.slice(cursor, end)) > byteCeiling) {

      end -= 1;

    }

    if (end === cursor) {

      end = cursor + 1;

    }

    batches.push(items.slice(cursor, end));

    cursor = end;

  }

  return batches;

}

async function classifyBatches(options: BatchClassifyOptions): Promise<LlmClassifyResult> {

  const { engine, mode, query, updateStmt, mapRow, onBatch } = options;

  const dbPath = twitterBookmarksIndexPath();

  const db = await openDb(dbPath);

  try {

    const rows = db.exec(query);

    if (!rows.length || !rows[0].values.length) {

      return { engine, totalUnclassified: 0, classified: 0, failed: 0, batches: 0 };

    }

    const items = rows[0].values.map(mapRow);

    const total = items.length;

    let classified = 0;

    let failed = 0;

    let processed = 0;

    const batches = splitAdaptiveBatches(mode, items);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {

      const batch = batches[batchIndex];

      const batchIds = new Set<string>(batch.map((item) => String(item.id)));

      onBatch?.(processed, total);

      processed += batch.length;

      try {

        const request: ClassificationRequest = { mode, items: batch };

        const results = invokeClassification(engine, request)

          .filter((result) => batchIds.has(result.id));

        const stmt = db.prepare(updateStmt);

        for (const result of results) {

          stmt.run([result.categories.join(','), result.primary, result.id]);

        }

        stmt.free();

        classified += results.length;

        failed += batch.length - results.length;

        saveDb(db, dbPath);

      } catch (error) {

        failed += batch.length;

        process.stderr.write(`  Batch ${batchIndex + 1} failed: ${(error as Error).message}\n`);

      }

    }

    return { engine, totalUnclassified: total, classified, failed, batches: batches.length };

  } finally {

    db.close();

  }

}

export async function classifyWithLlm(

  options: { engine?: Engine | 'auto'; onBatch?: (done: number, total: number) => void } = {},

): Promise<LlmClassifyResult> {

  const engine = resolveEngineOrThrow(options.engine);

  return classifyBatches({

    engine,

    mode: 'category',

    query: `SELECT id, text, author_handle, links_json FROM bookmarks

       WHERE primary_category = 'unclassified' OR primary_category IS NULL

       ORDER BY RANDOM()`,

    updateStmt: `UPDATE bookmarks SET categories = ?, primary_category = ? WHERE id = ?`,

    mapRow: (row) => ({

      id: row[0] as string,

      text: row[1] as string,

      authorHandle: row[2] as string | null,

      links: row[3] as string | null,

    }),

    onBatch: options.onBatch,

  });

}

export async function classifyDomainsWithLlm(

  options: { all?: boolean; engine?: Engine | 'auto'; onBatch?: (done: number, total: number) => void } = {},

): Promise<LlmClassifyResult> {

  const engine = resolveEngineOrThrow(options.engine);

  const dbPath = twitterBookmarksIndexPath();

  const db = await openDb(dbPath);

  try { db.run('ALTER TABLE bookmarks ADD COLUMN domains TEXT'); } catch {}

  try { db.run('ALTER TABLE bookmarks ADD COLUMN primary_domain TEXT'); } catch {}

  const query = options.all
    ? `SELECT id, text, author_handle, categories FROM bookmarks
       WHERE 1=1 ORDER BY RANDOM()`
    : `SELECT id, text, author_handle, categories FROM bookmarks
       WHERE primary_domain IS NULL ORDER BY RANDOM()`;

  return classifyBatches({
    engine,
    mode: 'domain',
    query,
    updateStmt: `UPDATE bookmarks SET domains = ?, primary_domain = ? WHERE id = ?`,

    mapRow: (row) => ({

      id: row[0] as string,

      text: row[1] as string,

      authorHandle: row[2] as string | null,

      categories: row[3] as string | null,

    }),

    onBatch: options.onBatch,

  });

}

