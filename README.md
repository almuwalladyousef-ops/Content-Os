# Content OS Suite

One Next.js app that merges five separate tools into a single dashboard + sidebar,
plus a companion **home server** that runs forever on the always-on Mac mini.

```
Vercel (contentos-flame.vercel.app)            Mac mini (home-server/, port 3737)
├─ /            Dashboard                       ├─ /                board (vault kanban)
├─ /post /analysis /history /settings          ├─ /storage/*       large files (videos/media)
├─ /dm  /dm/rules  /dm/settings   (TriggerDM)   ├─ /readback-api/*  readback engine (TTS)
├─ /board          native vault kanban          ├─ /linkscribe/*    yt-dlp + local Whisper
├─ /linkscribe                    (LinkScribe)  ├─ vault API (scan/write/create/delete)
├─ /readback                      (Readback)    ├─ Google proxies + /open + legacy board at /
└─ /api/…  all APIs + OAuth callbacks           └─ due-time scheduler + daily DM tick
        │                                                     ▲
        └──── HTTPS (Tailscale Funnel) + Bearer HOME_SERVER_SECRET ┘

    All JSON state → Google Drive JSON-DB (service account, one file per section)
    All large binaries → the mini's disk (served by the home server)
```

If the mini is offline, browsing / analysis / manual posting / DM webhooks still work;
scheduled posts, readback, and linkscribe pause until it's back (the dashboard shows a
live online/offline indicator).

## Local development

```bash
npm install
cp .env.example .env.local     # fill in what you have; blanks fall back to a local .dev-db
npm run dev                    # http://localhost:3000
```

Without Google service-account creds the app uses a local `.dev-db/` JSON store, so every
page and the DM rules CRUD work offline. To exercise the mini locally:

```bash
cd home-server && npm install
cp .env.example .env
PORT=3838 npm run dev          # keeps the real launchd server on :3737 untouched
```

Point the app at it with `HOME_SERVER_URL=http://localhost:3838` in `.env.local`.

## Yousef's manual steps (deploy)

You never need to touch code — just click through these once.

1. **Google Drive DB** — create (or pick) a folder for the JSON database. Share it with the
   service-account email. Put the folder id in `DRIVE_DB_FOLDER_ID`, and the existing
   TriggerDM `db.json` file id in `GOOGLE_DRIVE_FILE_ID` (it becomes the `dm` section, so all
   existing rules/tokens carry over).
2. **GitHub** — create a new repo and push `content-os-suite` to it (`git remote add origin …`
   then `git push -u origin main`).
3. **Vercel** — in the existing **contentos-flame** project → Settings → Git → disconnect the
   old `almuwalladyousef-ops/contentos` repo and connect the new one. Same project ⇒ same URL
   ⇒ the TikTok callback stays valid. (Rollback = reconnect the old repo; never delete it.)
4. **Vercel env** — set every var from `.env.example`. Use the **live** TikTok app's key/secret
   (not the sandbox).
5. **TikTok dev portal** (live app) — confirm redirect URI
   `https://contentos-flame.vercel.app/api/auth/tiktok/callback`.
6. **Meta dev portal** (your personal app) — enable **Instagram Login**, add redirect URI
   `https://contentos-flame.vercel.app/api/auth/instagram/callback`, and point the webhook to
   `https://contentos-flame.vercel.app/api/dm/webhook` with your `VERIFY_TOKEN`.
7. **Mac mini** — install Node + `tailscale`; run `tailscale funnel 3737` once (persists across
   reboots). Fill `home-server/.env`, then `cd home-server && ./install-launchd.sh`. Put the
   funnel URL in Vercel `HOME_SERVER_URL` and the same secret in `HOME_SERVER_SECRET`.
   For LinkScribe, install `yt-dlp`, `ffmpeg`, and OpenAI Whisper (`pip install -U openai-whisper`).
8. **After production looks good** — pause/remove the old standalone LinkScribe and TriggerDM
   Vercel projects. Do **not** delete the old contentos repo (it's your rollback).

See `home-server/README.md` for the mini setup in detail.

## Rules baked into this repo

- The five source folders under `~/Downloads` are **read-only inputs** — never edited.
- **No Vercel Blob** (removed); large files live on the mini, JSON state in Drive.
- **No login gates, passwords, or rate limits** — personal single-user app. The only secret is
  the one shared `HOME_SERVER_SECRET` (Tailscale Funnel exposes the mini publicly).
- **One Instagram Login** for every account type (posting, analytics, and DM automation share
  the same token); no hardcoded Business/Personal buckets.
