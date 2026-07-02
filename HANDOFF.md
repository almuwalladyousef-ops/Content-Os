# Handoff — read this first

**The full execution plan is `/Users/yousef/Downloads/CONTENT-OS-SUITE-PLAN.md`.**
Read it before doing anything. This file only records what is already DONE in this
repo and what to do next. Rules that always apply: never touch the five source
folders (contentos, linkscribe, triggerdm, readback, contentos-app-shell,
contentos-local-server — read-only inputs); no Vercel Blob; no passwords/login
gates/rate limits (personal app); commit after each phase; `npm run build` must be
green before every commit.

## Done (by Fable — do NOT redo)

- **Phase 1** — scaffold from contentos, builds green.
- **Phase 2 core** — `home-server/`: board bundled (`board/content-os.html`), storage
  API (`storage.js`: `PUT/GET/DELETE /storage/file/<key>`, `GET/PUT /storage/json/<doc>`,
  bearer or `?secret=`), `/api/health`, 60s schedule heartbeat + daily
  `/api/dm/refresh-token` tick, launchd plist + `install-launchd.sh`.
  Tested: file round-trip byte-identical, traversal blocked, board serves.
  **Still open in home-server (Sonnet):** mount readback engine at `/readback-api/*`
  (dynamic `import()` — readback is ESM, server.js is CommonJS) and
  `linkscribe-worker.js` (commented mount points are in server.js).
- **Phase 3** — Vercel Blob fully removed. `lib/drive-db.ts` (Drive JSON-DB,
  per-section files, `.dev-db/` fallback without creds), `lib/home-storage.ts`,
  `lib/media-upload.ts` (browser → mini direct upload with progress),
  `/api/media/{config,delete}`, schedule queue in Drive DB section `schedule`
  (still AES-encrypted), `ScheduledJob.fileKey` added, cron worker unchanged
  (fetches `job.blobUrl`, now a home-server URL that Instagram can also fetch).
- **Phase 6** — ONE Instagram Login (`lib/instagram.ts` rewritten for
  graph.instagram.com; `INSTAGRAM_APP_ID/SECRET`). Callback dual-writes the cookie
  AND `storedTokens['WORKSPACE_TOKEN:ig-<igUserId>']` in the `dm` Drive-DB section.

## Next (in order)

1. **Sonnet — Phase 4**: dashboard at `app/page.tsx` + two-group sidebar (plan §5 Phase 4).
2. **Opus — Phase 5**: TriggerDM merge under `/dm` + `/api/dm/*`, Next 14→16 pass,
   delete ALL Business/Personal hardcoding, rewire its driveDB to `lib/drive-db.ts`
   (`readDoc/writeDoc/updateDoc` on section `dm`). Its OLD auth pages are NOT copied —
   auth is already done (Phase 6). Make `lib/dm/accounts.js` read tokens from
   `storedTokens` (keys `WORKSPACE_TOKEN:ig-*` written by the new callback).
   Implement `/api/dm/refresh-token` to refresh all stored long-lived tokens via
   `refreshLongLivedToken()` from `lib/instagram.ts`.
3. **Sonnet — Phase 7**: LinkScribe UI + `linkscribe-worker.js` on the home server
   (local Whisper; plan §6.3).
4. **Opus — Phase 8**: Readback UI port + `/api/readback/[...path]` proxy + engine
   mount in home-server (plan §5 Phase 8, §7).
5. **Sonnet — Phase 9**: cleanup + root README with Yousef's manual steps (plan §10).

## Env quick reference

Root `.env.example` and `home-server/.env.example` are current. New since contentos:
`HOME_SERVER_URL`, `HOME_SERVER_SECRET`, `INSTAGRAM_APP_ID/SECRET` (replaced
`FACEBOOK_APP_*`), `VERIFY_TOKEN`, `ALLOW_UNVERIFIED_WEBHOOKS=true`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `DRIVE_DB_FOLDER_ID`,
`GOOGLE_DRIVE_FILE_ID` (legacy id of triggerdm's db.json = the `dm` section).
Gone: `BLOB_READ_WRITE_TOKEN`.
