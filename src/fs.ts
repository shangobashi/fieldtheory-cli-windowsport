import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { restrictWindowsAcl } from './windows-acl.js';

export const SENSITIVE_DIR_MODE = 0o700;
export const MAX_JSON_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_JSONL_FILE_BYTES = 128 * 1024 * 1024;

function asErrno(error: unknown): NodeJS.ErrnoException | null {
  return typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException) : null;
}

async function assertFileSizeWithinLimit(filePath: string, maxBytes: number, label: string): Promise<void> {
  const info = await stat(filePath);
  if (info.size > maxBytes) {
    throw new Error(`${label} exceeds size limit (${info.size} bytes > ${maxBytes} bytes): ${filePath}`);
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function ensureSensitiveDir(
  dirPath: string,
  options: {
    platform?: NodeJS.Platform;
    restrictAcl?: (targetPath: string, isDirectory?: boolean) => void;
  } = {}
): Promise<void> {
  await mkdir(dirPath, { recursive: true, mode: SENSITIVE_DIR_MODE });

  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    const restrictAcl = options.restrictAcl ?? restrictWindowsAcl;
    restrictAcl(dirPath, true);
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function readJson<T>(filePath: string): Promise<T> {
  await assertFileSizeWithinLimit(filePath, MAX_JSON_FILE_BYTES, 'JSON file');
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function writeJsonLines(filePath: string, rows: unknown[]): Promise<void> {
  const content = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  await writeFile(filePath, content, 'utf8');
}

export async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    await assertFileSizeWithinLimit(filePath, MAX_JSONL_FILE_BYTES, 'JSONL file');
  } catch (error) {
    const errno = asErrno(error);
    if (errno?.code === 'ENOENT') return [];
    throw error;
  }

  const rows: T[] = [];
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  try {
    for await (const line of rl) {
      lineNumber += 1;
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        rows.push(JSON.parse(trimmed) as T);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON on line ${lineNumber} in ${filePath}: ${detail}`);
      }
    }
  } finally {
    rl.close();
  }

  return rows;
}
