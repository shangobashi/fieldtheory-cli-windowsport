import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export function currentWindowsIdentity(): string {
  const username = os.userInfo().username;
  const domain = process.env.USERDOMAIN?.trim();
  return domain ? `${domain}\\${username}` : username;
}

export function normalizeWindowsAclTargetPath(targetPath: string): string {
  if (typeof targetPath !== 'string') {
    throw new Error('ACL target path must be a string');
  }
  if (targetPath.includes('\0')) {
    throw new Error('ACL target path must not contain NUL bytes');
  }

  const trimmed = targetPath.trim();
  if (!trimmed) {
    throw new Error('ACL target path must not be empty');
  }

  return path.resolve(path.normalize(trimmed));
}

export function buildWindowsAclGrant(identity: string, isDirectory = false): string {
  return isDirectory ? `${identity}:(OI)(CI)F` : `${identity}:F`;
}

export function restrictWindowsAcl(targetPath: string, isDirectory = false): void {
  const identity = currentWindowsIdentity();
  const normalizedPath = normalizeWindowsAclTargetPath(targetPath);
  const grant = buildWindowsAclGrant(identity, isDirectory);

  execFileSync('icacls', [normalizedPath, '/inheritance:r', '/grant:r', grant], {
    stdio: 'ignore',
  });
}
