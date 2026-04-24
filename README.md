# FieldTheoryX v0.5.1 for Windows



<p align="center">
  <img src="./website/images/fieldtheory-user-logo-transparent-v3.png" alt="FieldTheoryX logo" width="180" />
</p>



FieldTheoryX for Windows

It syncs your X/Twitter bookmarks into a local cache, builds a local SQLite FTS index, and exposes a CLI that works well with shell-driven agents such as Codex ; and even better with agent harnesses such as Hermes. Bonus idea: don't even interact with FieldTheoryX manually; simply feed the repo to your agent of choice and have it sync your bookmarks into its Memory System (my own two cents: works very well with Obsidian as Memory Vault). 

## Release Status

**v0.5.1 is the first public release of FieldTheoryX CLI Windows Port.**

Core bookmark sync, search, and indexing are stable and release-ready. LLM-powered classification (`ftx classify`, `ftx classify-domains`) is available as an experimental feature in this release. Classification is structurally hardened and covered by unit tests — payload is never passed in argv, output is schema-validated, and batch failures are isolated per-item. Final live upstream verification with Codex and Claude is still pending due to provider rate limits; classification output may evolve and temporary availability changes are possible until that validation is complete. See the `[Experimental]` markers in the Commands table below.

This release also includes substantial security hardening across LLM transport, SQL safety, media handling, DevTools loopback enforcement, Windows secret storage, and filesystem protections. See `SECURITY-HARDENING.md` for details. Still, be careful using this; in this day and age, never trust -- always verify.

## What's New in v0.5.1

- **Full sync by default**: `ftx sync` now fetches all bookmarks from the beginning (use `--incremental` for incremental mode)
- **Chrome & Brave support**: Auto-detects Chrome or Brave browser
- **DevTools Protocol fallback**: For newer browsers with v20 encryption, uses Chrome DevTools Protocol to extract cookies directly
- **Security hardening**: See `SECURITY-HARDENING.md` for v0.5.1 hardening details and residual risks ; take this seriously
- **LLM classification** *(experimental in v0.5.1)*: `ftx classify` and `ftx classify-domains` use Codex or Claude to categorize bookmarks by topic. Classification is an advanced feature currently undergoing final validation — output categories may evolve and the feature may be temporarily unavailable while that validation completes. Core sync, search, and indexing are stable and fully released.

## Inspiration

This project is completely inspired by **FieldTheory by Andrew Farah**, for mac OS. The original project established the local-first bookmark workflow and the overall CLI shape that this fork builds on.

## What Changed

- Windows Chrome & Brave cookie extraction for `sync`
- DevTools Protocol fallback for v20 encryption
- Full sync by default (fetches all bookmarks)
- No dependency on an external `sqlite3` binary
- `ftx doctor` for machine checks
- `ftx` command name and a separate default data directory
- Codex-first LLM engine preference, with Claude fallback if Codex CLI is not installed *(classification is experimental — see note in "What's New")*

## Install

Install from npm:

```bash
npm install -g FieldTheoryX-cli-windowsport
ftx --help
```

Install directly from GitHub:

```bash
npm install -g github:shangobashi/FieldTheoryX-cli-windowsport
ftx --help
```

Install from a local checkout:

```bash
npm install
npm run build
npm install -g .
ftx --help
```

On Windows PowerShell, if script execution blocks `npm`, use `npm.cmd` instead.
Requires Node.js 20+ and Google Chrome or Brave Browser.

## Optional environment variables

- `X_PUBLIC_BEARER`: override the default public X web bearer token used for GraphQL bookmark sync.
- `FTX_DATA_DIR`: override the local data directory.

## Quick Start

```bash
ftx doctor # Check environment
ftx sync # Sync all bookmarks (default: full sync)
ftx sync --incremental # Or sync incrementally (only new bookmarks)
ftx search "machine learning" # Search bookmarks
ftx stats # View stats
```

## Browser Support

FieldTheoryX supports both **Google Chrome** and **Brave Browser**:
1. **Standard extraction**: Reads cookies directly from the browser's SQLite database
2. **DevTools Protocol fallback**: For newer browsers with v20 encryption, extracts cookies from the running browser via DevTools Protocol

To use DevTools Protocol:
1. Start your browser with: `brave.exe --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222` or `chrome.exe --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222`
2. Keep DevTools bound to loopback only (`127.0.0.1` / `localhost`) and do not expose the debugging port on LAN interfaces.
3. Run `ftx sync` — it will automatically use DevTools Protocol if standard extraction fails

## Commands

| Command | Description |
|---|---|
| `ftx sync` | Sync bookmarks from X (full sync by default) |
| `ftx sync --incremental` | Sync only new bookmarks since last sync |
| `ftx search <query>` | Full-text search across bookmarks |
| `ftx list` | List bookmarks with filters |
| `ftx show <id>` | Show one bookmark in detail |
| `ftx stats` | Aggregate statistics |
| `ftx classify` **[Experimental]** | Classify bookmarks by category using Codex or Claude |
| `ftx classify-domains` **[Experimental]** | Classify by subject domain using Codex or Claude |
| `ftx doctor` | Check local prerequisites |
| `ftx viz` | Visual dashboard |


## Credits

- **Andrew Farah**'s Field Theory  — the original local-first bookmark archive CLI
- **Shango Bashi** — Windows port, Brave support, DevTools Protocol fallback, performance optimizations

MIT License.














