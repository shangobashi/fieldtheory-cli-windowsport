import { spawn } from 'node:child_process';

const POWERSHELL_PROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
$inputBase64 = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($inputBase64)) { throw 'DPAPI protect input is empty' }
$plainBytes = [System.Convert]::FromBase64String($inputBase64.Trim())
$cipherBytes = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([System.Convert]::ToBase64String($cipherBytes))
`.trim();

const POWERSHELL_UNPROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
$inputBase64 = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($inputBase64)) { throw 'DPAPI unprotect input is empty' }
$cipherBytes = [System.Convert]::FromBase64String($inputBase64.Trim())
$plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($cipherBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([System.Convert]::ToBase64String($plainBytes))
`.trim();

function runPowerShell(script: string, stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error: Error) => {
      reject(new Error(`DPAPI PowerShell execution failed: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`DPAPI PowerShell execution failed: ${stderr.trim() || `exit code ${code}`}`));
        return;
      }
      const output = stdout.trim();
      if (!output) {
        reject(new Error('DPAPI PowerShell returned empty output'));
        return;
      }
      resolve(output);
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export async function protectWindowsSecret(data: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new Error('Cannot encrypt an empty secret');
  }
  const input = data.toString('base64');
  const outputB64 = await runPowerShell(POWERSHELL_PROTECT_SCRIPT, input);
  return Buffer.from(outputB64, 'base64');
}

export async function unprotectWindowsSecret(data: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new Error('Cannot decrypt an empty secret envelope');
  }
  const outputB64 = await runPowerShell(POWERSHELL_UNPROTECT_SCRIPT, data.toString('base64'));
  return Buffer.from(outputB64, 'base64');
}
