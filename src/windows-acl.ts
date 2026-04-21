import { execFileSync } from 'node:child_process';
import os from 'node:os';

export function currentWindowsIdentity(): string {
  const username = os.userInfo().username;
  const domain = process.env.USERDOMAIN?.trim();
  return domain ? `${domain}\\${username}` : username;
}

export function restrictWindowsAcl(targetPath: string, isDirectory = false): void {
  const identity = currentWindowsIdentity();
  const grant = isDirectory ? `${identity}:(OI)(CI)F` : `${identity}:F`;

  execFileSync('icacls', [targetPath, '/inheritance:r', '/grant:r', grant], {
    stdio: 'ignore',
  });
}