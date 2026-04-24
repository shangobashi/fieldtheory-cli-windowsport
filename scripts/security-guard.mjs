#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const SRC_DIR = path.join(repoRoot, 'src');

const checks = [
  {
    id: 'sql-identifier-interpolation',
    message: 'Unchecked SQL interpolation detected in classify query construction.',
    files: ['src/bookmark-classify-llm.ts'],
    pattern: /\bWHERE\s+\$\{where\}\b/g,
  },
  {
    id: 'classification-payload-in-argv',
    message: 'Classification payload/prompt appears in argv; send via stdin instead.',
    files: ['src/llm-exec.ts', 'src/bookmark-classify-llm.ts'],
    pattern: /\[(?:.|\n|\r)*?(?:buildClassificationPayload\(|PAYLOAD_JSON|\bprompt\b)(?:.|\n|\r)*?\]/g,
  },
  {
    id: 'media-extension-from-url-path',
    message: 'Media extension inferred from URL path; use content-type allowlist instead.',
    files: ['src/bookmark-media.ts'],
    pattern: /path\.extname\(\s*new\s+URL\([^)]*\)\.pathname\s*\)/g,
  },
  {
    id: 'sensitive-media-dir-via-permissive-helper',
    message: 'Sensitive media directory created with ensureDir(); use ensureSensitiveDir().',
    files: ['src/**/*.ts'],
    pattern: /ensureDir\(\s*mediaDir\s*\)/g,
  },
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function toRepoPath(absPath) {
  return absPath.split(path.sep).join('/').replace(`${repoRoot.split(path.sep).join('/')}/`, '');
}

function fileMatchesAnyGlob(repoPath, globs) {
  return globs.some((glob) => {
    if (glob.endsWith('/**/*.ts')) {
      const prefix = glob.replace('/**/*.ts', '/');
      return repoPath.startsWith(prefix) && repoPath.endsWith('.ts');
    }
    return repoPath === glob;
  });
}

const candidates = walk(SRC_DIR);
const violations = [];

for (const absPath of candidates) {
  const repoPath = toRepoPath(absPath);
  const text = fs.readFileSync(absPath, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const check of checks) {
    if (!fileMatchesAnyGlob(repoPath, check.files)) continue;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.includes('security-guard-ignore')) continue;
      if (check.pattern.test(line)) {
        violations.push({ check: check.id, message: check.message, file: repoPath, line: i + 1, content: line.trim() });
      }
      check.pattern.lastIndex = 0;
    }
  }
}

if (violations.length > 0) {
  console.error('Security guard failed.');
  for (const violation of violations) {
    console.error(`- [${violation.check}] ${violation.file}:${violation.line}`);
    console.error(`  ${violation.message}`);
    console.error(`  ${violation.content}`);
  }
  process.exit(1);
}

console.log('Security guard passed.');
