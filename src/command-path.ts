import fs from 'node:fs';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';

function pathEntries(): string[] {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function commandExtensions(): string[] {
  if (process.platform !== 'win32') return [''];
  const raw = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD';
  return raw
    .split(';')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function candidateNames(command: string): string[] {
  if (process.platform !== 'win32') return [command];

  const lower = command.toLowerCase();
  const hasKnownExtension = commandExtensions().some((ext) => lower.endsWith(ext));
  if (hasKnownExtension) return [command];

  return ['', ...commandExtensions()].map((ext) => `${command}${ext}`);
}

function isExecutable(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  if (process.platform === 'win32') return true;

  try {
    fs.accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveCommandPath(command: string): string | null {
  const includesSeparator = command.includes('/') || command.includes('\\');
  if (includesSeparator) {
    const absolute = path.resolve(command);
    return isExecutable(absolute) ? absolute : null;
  }

  for (const dir of pathEntries()) {
    for (const name of candidateNames(command)) {
      const fullPath = path.join(dir, name);
      if (isExecutable(fullPath)) return fullPath;
    }
  }

  return null;
}

export function isCommandAvailable(command: string): boolean {
  return resolveCommandPath(command) !== null;
}
