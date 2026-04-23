# FieldTheory v0.4.15 for Windows







FieldTheory for Windows is a Windows-focused fork inspired by **FieldTheory by Andrew Farah**.







It syncs your X/Twitter bookmarks into a local cache, builds a local SQLite FTS index, and exposes a CLI that works well with shell-driven agents such as Codex.







## What's New in v0.4.15







- **Full sync by default**: `ftx sync` now fetches all bookmarks from the beginning (use `--incremental` for incremental mode)



- **Chrome & Brave support**: Auto-detects Chrome or Brave browser



- **DevTools Protocol fallback**: For newer browsers with v20 encryption, uses Chrome DevTools Protocol to extract cookies directly



- **16,668+ bookmarks synced**: Full history from 2012 to present







## Inspiration







This project is completely inspired by **FieldTheory by Andrew Farah**. The original project established the local-first bookmark workflow and the overall CLI shape that this fork builds on.







## What Changed







- Windows Chrome & Brave cookie extraction for `sync`



- DevTools Protocol fallback for v20 encryption



- Full sync by default (fetches all bookmarks)



- No dependency on an external `sqlite3` binary



- `ftx doctor` for machine checks



- `ftx` command name and a separate default data directory



- Codex-first LLM engine preference, with Claude fallback if Codex CLI is not installed







## Install







Install from npm:







```bash



npm install -g fieldtheory-cli-windowsport



ftx --help



```







Install directly from GitHub:







```bash



npm install -g github:shangobashi/fieldtheory-cli-windowsport



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



# Check environment



ftx doctor







# Sync all bookmarks (default: full sync)



ftx sync







# Or sync incrementally (only new bookmarks)



ftx sync --incremental







# Search bookmarks



ftx search "machine learning"







# View stats



ftx stats



```







## Browser Support







FieldTheory supports both **Google Chrome** and **Brave Browser**:







1. **Standard extraction**: Reads cookies directly from the browser's SQLite database



2. **DevTools Protocol fallback**: For newer browsers with v20 encryption, extracts cookies from the running browser via DevTools Protocol







To use DevTools Protocol:



1. Start your browser with: `brave.exe --remote-debugging-port=9222` or `chrome.exe --remote-debugging-port=9222`



2. Run `ftx sync` — it will automatically use DevTools Protocol if standard extraction fails







## Commands







| Command | Description |



|---|---|



| `ftx sync` | Sync bookmarks from X (full sync by default) |



| `ftx sync --incremental` | Sync only new bookmarks since last sync |



| `ftx search <query>` | Full-text search across bookmarks |



| `ftx list` | List bookmarks with filters |



| `ftx show <id>` | Show one bookmark in detail |



| `ftx stats` | Aggregate statistics |



| `ftx classify` | Classify bookmarks by category (LLM) |



| `ftx classify-domains` | Classify by subject domain (LLM) |



| `ftx doctor` | Check local prerequisites |



| `ftx viz` | Visual dashboard |







## Credits







- **FieldTheory** by Andrew Farah — the original local-first bookmark archive CLI



- **Shango Bashi** — Windows port, Brave support, DevTools Protocol fallback, performance optimizations







MIT License.



