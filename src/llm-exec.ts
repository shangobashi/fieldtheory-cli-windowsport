import { execFileSync } from 'node:child_process';

import fs from 'node:fs';

import os from 'node:os';

import path from 'node:path';

import { resolveCommandPath } from './command-path.js';

import {

  buildClassificationPayload,

  buildStaticClassificationInstruction,

  ClassificationRequest,

  getClassificationOutputSchema,

  NormalizedClassification,

  parseAndValidateClassificationOutput,

} from './llm-schema.js';

interface LlmExecDeps {

  execFileSync: typeof execFileSync;

  mkdtempSync: typeof fs.mkdtempSync;

  writeFileSync: typeof fs.writeFileSync;

  readFileSync: typeof fs.readFileSync;

  rmSync: typeof fs.rmSync;

  resolveCommandPath: (command: string) => string | null;

}

let testDeps: Partial<LlmExecDeps> = {};

function deps(): LlmExecDeps {

  return {

    execFileSync,

    mkdtempSync: fs.mkdtempSync,

    writeFileSync: fs.writeFileSync,

    readFileSync: fs.readFileSync,

    rmSync: fs.rmSync,

    resolveCommandPath,

    ...testDeps,

  };

}

export function __setLlmExecDepsForTests(overrides: Partial<LlmExecDeps> = {}): void {

  testDeps = overrides;

}

const DEFAULT_EXEC_OPTIONS = {
  encoding: 'utf8' as const,
  timeout: 120_000,
  maxBuffer: 1024 * 1024,
  stdio: ['pipe', 'pipe', 'ignore'] as Array<'pipe' | 'ignore'>,
};

function requireEnginePath(engine: 'codex' | 'claude'): string {

  const resolved = deps().resolveCommandPath(engine);

  if (!resolved) {

    throw new Error(`The ${engine} CLI is not available on PATH.`);

  }

  return resolved;

}

export function invokeCodexClassification(request: ClassificationRequest): NormalizedClassification[] {

  const bin = requireEnginePath('codex');

  const d = deps();

  const tmpDir = d.mkdtempSync(path.join(os.tmpdir(), 'ftx-llm-codex-'));

  const schemaPath = path.join(tmpDir, 'classification-schema.json');

  const outputPath = path.join(tmpDir, 'classification-output.json');

  try {

    d.writeFileSync(schemaPath, JSON.stringify(getClassificationOutputSchema(request.mode)));

    const stdin = [

      buildStaticClassificationInstruction(request.mode),

      '',

      'PAYLOAD_JSON:',

      buildClassificationPayload(request),

    ].join('\n');

    d.execFileSync(bin, [

      'exec',

      '-',

      '--sandbox',

      'read-only',

      '--output-schema',

      schemaPath,

      '-o',

      outputPath,

    ], {

      ...DEFAULT_EXEC_OPTIONS,

      input: stdin,

    });

    const raw = d.readFileSync(outputPath, 'utf-8').trim();

    if (!raw) {

      throw new Error('Codex produced empty structured output.');

    }

    return parseAndValidateClassificationOutput(raw, request.mode);

  } finally {

    d.rmSync(tmpDir, { recursive: true, force: true });

  }

}

export function invokeClaudeClassification(request: ClassificationRequest): NormalizedClassification[] {

  const bin = requireEnginePath('claude');

  const d = deps();

  const tmpDir = d.mkdtempSync(path.join(os.tmpdir(), 'ftx-llm-claude-'));

  const schemaPath = path.join(tmpDir, 'classification-schema.json');

  try {

    d.writeFileSync(schemaPath, JSON.stringify(getClassificationOutputSchema(request.mode)));

    const raw = d.execFileSync(bin, [

      '-p',

      buildStaticClassificationInstruction(request.mode),

      '--output-format',

      'json',

      '--json-schema',

      schemaPath,

      '--max-turns',

      '1',

      '--no-session-persistence',

      // Residual risk note: this implementation does not force tool disablement because

      // current CLI flags are not consistently available across Claude Code versions.

    ], {

      ...DEFAULT_EXEC_OPTIONS,

      input: buildClassificationPayload(request),

    }).trim();

    if (!raw) {

      throw new Error('Claude produced empty structured output.');

    }

    return parseAndValidateClassificationOutput(raw, request.mode);

  } finally {

    d.rmSync(tmpDir, { recursive: true, force: true });

  }

}

