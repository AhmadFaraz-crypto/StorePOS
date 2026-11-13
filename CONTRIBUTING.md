# Contributing to StorePOS

Thanks for your interest in improving StorePOS! This guide covers how to get set
up and the conventions we follow.

## Development setup

```bash
npm install      # installs deps; rebuilds better-sqlite3 for Electron
npm run dev       # launch the app with hot reload
npm run typecheck # TypeScript checks (run before opening a PR)
npm test          # unit tests (Vitest)
npm run build     # production build of main / preload / renderer
```

Requirements: Node 20+ and npm 10+.

## Project layout

```
src/
  main/      Electron main process — window, SQLite (db.ts), IPC, scanner server
  preload/   Context-isolated bridge exposing a typed window.api
  renderer/  React UI (screens/, components/, i18n/)
  shared/    Types shared across all layers (the IPC contract lives here)
```

- The SQLite schema is **sync-ready**: every table has `id` (UUID), `store_id`,
  `updated_at`, and a soft-delete `deleted_at`. Keep new tables consistent with this.
- All user-facing strings go through i18n (`t('...')`) with entries in
  `src/renderer/src/i18n/en.json` and `ur.json`. Don't hardcode display text.

## Pull requests

1. Fork and create a branch from `main`.
2. Make your change; keep it focused.
3. Run `npm run typecheck` and `npm run build` — both must pass.
4. If you added UI text, add the key to **every** locale file.
5. Open a PR describing the change and how you tested it.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what happened.
Include your OS and app version.

## Code style

TypeScript throughout, React function components with hooks. Match the style of
the surrounding code. No linter is enforced yet, but keep imports tidy and avoid
dead code.
