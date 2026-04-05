# CLAUDE.md

This repo contains **FieldTheory for Windows**, a Windows-focused fork inspired by **FieldTheory by Andrew Farah**.

## Commands

```bash
npm run build
npm run dev
npm run test
npm run start
```

## Architecture

Single Commander.js CLI with local JSONL cache plus SQLite FTS.

### Important files

| File | Purpose |
|------|---------|
| `src/cli.ts` | Commands, first-run UX, doctor output |
| `src/chrome-cookies.ts` | macOS and Windows Chrome cookie extraction |
| `src/graphql-bookmarks.ts` | GraphQL session sync |
| `src/bookmarks.ts` | OAuth API sync |
| `src/bookmarks-db.ts` | SQLite index, search, stats, list |
| `src/bookmark-classify-llm.ts` | Codex/Claude CLI integration |
| `src/paths.ts` | Data directory resolution (`.ftx-bookmarks`) |
| `website/` | Product landing page |

### Defaults

- Command: `ftx`
- Data dir: `~/.ftx-bookmarks`
- Inspiration credit to Andrew Farah should remain visible in the repo and site
