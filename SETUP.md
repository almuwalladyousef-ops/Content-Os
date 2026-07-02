# ContentOS — one-time setup

After this is done, the whole app works by pressing **Connect** on each account in
**Settings**. There are no keys or tokens to paste anywhere in the UI ever again.

## What you connect in the app (zero config)

In **Settings** you'll see exactly three buttons:

| Button | Authorizes | Used for |
| --- | --- | --- |
| **Connect YouTube** | Google account | YouTube upload, Drive storage, analytics, email reports |
| **Connect Instagram** | Instagram (Business/Creator) | Reels publishing + insights |
| **Connect TikTok** | TikTok account | Direct posting + video stats |

Each is one OAuth click → authorize → done. Tokens are stored encrypted in your
browser session, **never in the UI, never in Drive**, and refresh automatically.

## The only thing you set up once: the app's OAuth credentials

OAuth requires each platform to know *which app* is asking for access, so every
platform makes you register a developer app once and gives you a client ID/secret.
You paste those into environment variables **one time** (locally and in Vercel) —
not into the app UI.

1. Copy `.env.example` to `.env.local` and fill it in.
2. Generate the cookie key: `openssl rand -base64 32` → `NEXTAUTH_SECRET`.
3. Register the three developer apps and set their redirect URIs to:
   - Google:    `<your-domain>/api/auth/callback`
   - TikTok:    `<your-domain>/api/auth/tiktok/callback`
   - Instagram: `<your-domain>/api/auth/instagram/callback`
4. In production, add the same variables in **Vercel → Project → Settings →
   Environment Variables**, and set `NEXTAUTH_URL` to your deployed URL.

That's the entire setup. From then on it's just the Connect buttons.

## Fixing the two most common errors

The **Settings page lists the exact redirect URIs** to register (with Copy buttons).
Use those — they are computed from the live domain, so they can't be mistyped.

### Instagram: "URL Blocked — redirect URI is not whitelisted"

This is purely a Meta app setting. In **developers.facebook.com → your app**:

1. Add the **Facebook Login** product (not "Instagram" — this flow uses Facebook Login).
2. **Facebook Login → Settings**:
   - Turn **Client OAuth Login** = **Yes**
   - Turn **Web OAuth Login** = **Yes**
   - Under **Valid OAuth Redirect URIs**, paste the Instagram URI from Settings
     (`https://<your-domain>/api/auth/instagram/callback`) and **Save Changes**.
3. **App Domains** (App Settings → Basic): add `<your-domain>` (no `https://`, no path).
4. If your app is in **Development mode**, add your Facebook user as a **Tester/Admin**
   (App roles), or switch the app to **Live**.
5. Your Instagram account must be **Business or Creator** and linked to a Facebook Page
   you manage.

### TikTok: "We couldn't log in with TikTok … scope"

TikTok rejects the login when you request a scope the app hasn't been granted.
This app now requests only `user.info.basic, video.publish, video.upload` by default.

In **developers.tiktok.com → Manage apps → your app**:

1. Add products **Login Kit** and **Content Posting API**.
2. Under **Scopes**, make sure `user.info.basic`, `video.publish`, and `video.upload`
   are added/approved. Only request what's listed here.
3. Under **Login Kit → Redirect URI**, paste the TikTok URI from Settings
   (`https://<your-domain>/api/auth/tiktok/callback`).
4. If your app isn't audited yet, `video.publish` may be limited to private posts.
5. Want TikTok analytics too? Get `video.list` approved, then set the env var
   `TIKTOK_SCOPES=user.info.basic,video.publish,video.upload,video.list`.

### Other causes

- **`*_error=... app not configured`** banner → that platform's `CLIENT_ID/SECRET`
  (or `APP_ID/SECRET`) env vars aren't set in Vercel.
- **Redirect mismatch** → set `NEXTAUTH_URL` to your canonical domain (no trailing
  slash) so every redirect URI is stable, and register that exact URI.
