# FieldTheory for Windows

FieldTheory for Windows is a Windows-focused fork inspired by **FieldTheory by Andrew Farah**.

It syncs your X/Twitter bookmarks into a local cache, builds a local SQLite FTS index, and exposes a CLI that works well with shell-driven agents such as Codex.

## Inspiration

This project is completely inspired by **FieldTheory by Andrew Farah**. The original project established the local-first bookmark workflow and the overall CLI shape that this fork builds on.

## What Changed

- Windows Chrome cookie extraction for `sync`
- No dependency on an external `sqlite3` binary
- `ftx doctor` for machine checks
- `ftx` command name and a separate default data directory
- Codex-first LLM engine preference, with Claude fallback if Codex CLI is not installed

## Install

```bash
npm install
npm run build
node bin/ft.mjs --help
```

Global install:

```bash
npm install -g .
ftx --help
```

Install directly from GitHub:

```bash
npm install -g github:shangobashi/fieldtheory-cli-windowsport
ftx --help
```

Requires Node.js 20+ and Google Chrome.

## Quick Start

```bash
# 1. Verify your setup
ftx doctor

# 2. Sync bookmarks from the Chrome profile logged into X
ftx sync

# 3. Search them locally
ftx search "distributed systems"

# 4. Explore
ftx viz
ftx categories
ftx stats
```

On Windows, if Chrome keeps the cookies database locked, close Chrome completely before running `ftx sync`.

## Commands

| Command | Description |
|---------|-------------|
| `ftx sync` | Download and sync bookmarks using your Chrome session |
| `ftx sync --classify` | Sync then classify new bookmarks with Codex or Claude |
| `ftx sync --api` | Sync via OAuth API instead of the Chrome session |
| `ftx sync --csrf-token ... --cookie-header ...` | Bypass Chrome extraction and pass cookies directly |
| `ftx search <query>` | Full-text search with BM25 ranking |
| `ftx list` | Filter by author, date, category, or domain |
| `ftx show <id>` | Show one bookmark in detail |
| `ftx viz` | Terminal dashboard with categories and domains |
| `ftx classify` | Classify by category and domain using an installed LLM CLI |
| `ftx classify --regex` | Classify with the built-in regex classifier |
| `ftx classify-domains` | Reclassify bookmark subject domains |
| `ftx categories` | Show category distribution |
| `ftx domains` | Show domain distribution |
| `ftx stats` | Show top authors, languages, and date range |
| `ftx index` | Build or rebuild the local search index |
| `ftx auth` | Set up OAuth for API-based sync |
| `ftx status` | Show sync status and data location |
| `ftx path` | Print the data directory path |
| `ftx doctor` | Check Windows, Chrome, and LLM CLI prerequisites |

## Data

The default data directory is:

```text
%USERPROFILE%\.ftx-bookmarks\
```

Override it with `FTX_DATA_DIR`. For compatibility, `FT_DATA_DIR` is still respected if you already use the original variable name.

Typical files:

```text
.ftx-bookmarks/
  bookmarks.jsonl
  bookmarks.db
  bookmarks-backfill-state.json
  oauth-token.json
```

## LLM Engines

`ftx classify` and `ftx classify-domains` look for an installed LLM CLI in this order:

1. `codex`
2. `claude`

You can override that with:

```bash
ftx classify --engine codex
ftx classify --engine claude
```

Or with environment variables:

```bash
set FTX_LLM_ENGINE=codex
```

## Platform Support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Chrome session sync (`sync`) | Yes | No | Yes |
| OAuth API sync (`sync --api`) | Yes | Yes | Yes |
| Search / list / stats / viz | Yes | Yes | Yes |
| LLM classification | Yes | Yes | Yes |

## Security

- Your bookmark data stays local.
- Chrome cookies are read only for sync and are not stored separately.
- OAuth tokens are stored locally in the data directory.
- The GraphQL sync path uses the same X endpoints your browser uses.

## License

MIT.

Original concept and product inspiration: **FieldTheory by Andrew Farah**.
