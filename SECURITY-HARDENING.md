# Security hardening summary (v0.5.1)

This release includes hardening updates focused on DevTools transport validation, OAuth token-at-rest protection, Windows ACL safety checks, and lightweight guardrails against known regression patterns.

## 1) DevTools Protocol hardening
- DevTools HTTP bootstrap now uses `127.0.0.1` (loopback) instead of `localhost` literals.
- Added `getDevToolsVersion(port)` and validate `/json/version` before any target actions.
- `/json/version` validation now fails closed unless:
  - response is a JSON object
  - `Browser` indicates Chrome/Chromium/Brave
  - `webSocketDebuggerUrl` is a loopback-only websocket URL
- `/json/list` target validation now fails closed on malformed entries, unexpected target types, or non-loopback websocket endpoints.
- `/json/new` bootstrap URL is allowlisted to HTTPS `x.com` / `twitter.com` variants only.
- `/json/new` navigation URL is encoded using `encodeURIComponent`.

Residual risk:
- DevTools requires a browser process started in remote-debug mode. If users bind remote-debugging to non-loopback interfaces, local protections in this CLI still fail closed but the browser debug endpoint itself remains externally exposed.

## 2) OAuth token at rest hardening
- Added Windows DPAPI helper (`src/windows-dpapi.ts`) using fixed PowerShell scripts and stdin payload flow.
- On Windows, OAuth token writes now use encrypted envelope format:
  - `format: "dpapi-v1"`
  - `ciphertext_b64: "..."`
- Save path fails closed if encryption does not return valid ciphertext.
- Token loads now support:
  - DPAPI envelope on Windows
  - legacy plaintext JSON for backward compatibility
- Legacy plaintext token files loaded on Windows are migrated in-place to DPAPI envelope format.
- Non-Windows platforms retain plaintext JSON token storage with strict file permissions (`chmod 600`).

Residual risk:
- Non-Windows plaintext storage remains readable by processes with user-level file access on the same host.
- DPAPI scope is tied to the current Windows user profile/machine context.

## 3) Windows ACL hardening
- Added path normalization/resolution before ACL operations.
- Empty and NUL-byte paths are rejected.
- ACL grant remains restricted to current user identity only.
- File and directory grants continue using distinct `icacls` grant strings (`:F` vs `(OI)(CI)F`).

## 4) Regression hardening for known risky patterns
- Retained `X_PUBLIC_BEARER` override behavior and added regression coverage.
- Added lightweight guard script (`scripts/security-guard.mjs`) to detect and fail on high-risk patterns:
  - unchecked SQL interpolation patterns
  - classification payload/prompt in argv path
  - media extension inferred from URL path
  - sensitive media directory creation via permissive helper

Run manually:
- `npm run guard:security`

## Platform notes
- Windows:
  - OAuth token is DPAPI-encrypted at rest.
  - ACL tightening is applied for sensitive paths where configured.
- Linux/macOS:
  - OAuth token remains plaintext JSON with restrictive file mode.

## Tests added
- DevTools endpoint validation and URL encoding behavior.
- OAuth token storage compatibility/migration/encryption behaviors.
- Windows ACL normalization/validation/grant-format tests.
- `X_PUBLIC_BEARER` override regression test.
