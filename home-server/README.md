# Content OS — home server

The always-on companion that runs on the Mac mini. One Node process (port 3737,
launchd `KeepAlive`) that serves everything the Vercel app can't:

- **`/`** — the vault Kanban board (`board/content-os.html`), unchanged.
- **vault API + Google proxies + `/open`** — unchanged from `contentos-local-server`.
- **`/storage/*`** — large-file store (videos/media) replacing Vercel Blob. Bearer-guarded.
- **`/readback-api/*`** — the Readback engine (Microsoft Edge neural TTS, extraction,
  karaoke timing, saved library).
- **`/linkscribe/*`** — job runner: downloads a URL with `yt-dlp`, transcribes with **local
  Whisper**. Bearer-guarded.
- **event-driven scheduler**: Vercel sends each new post's due time once; the mini holds a
  local timer and calls `POSTER_URL/api/cron/post` only when due. A startup check and one daily
  recovery check rebuild the timer after outages. Returned jobs are mirrored into the vault
  board. Once a day it also pings
  `POSTER_URL/api/dm/refresh-token` to refresh Instagram long-lived tokens.

All data lives under `DATA_DIR` (default `~/ContentOS-data/`):
`files/`, `json/`, `readback/{cache,library}/`, `linkscribe/jobs/`.

## One-time setup

```bash
# 1. Node (system or homebrew) — the bundled-node hack is gone.
brew install node yt-dlp ffmpeg
pip3 install -U openai-whisper            # local, free transcription

# 2. Install deps + env
cd home-server
npm install
cp .env.example .env                      # fill in HOME_SERVER_SECRET (+ Google board creds)

# 3. Expose it to the Vercel app over HTTPS (persists across reboots)
tailscale funnel 3737
#   → copy the https://<machine>.<tailnet>.ts.net URL into Vercel HOME_SERVER_URL

# 4. Run forever under launchd (RunAtLoad + KeepAlive)
./install-launchd.sh
```

Logs: `~/Library/Logs/contentos-homeserver.log`. Kill the process and launchd restarts it.

## Dev / testing

```bash
PORT=3838 npm run dev     # leave the real launchd server on :3737 alone
curl localhost:3838/api/health
curl localhost:3838/readback-api/voices
```

`HOME_SERVER_SECRET` empty ⇒ storage/linkscribe run open (local dev only). In production it's
required because Tailscale Funnel is public — it's the single shared secret the Vercel app
sends as `Authorization: Bearer …`.
