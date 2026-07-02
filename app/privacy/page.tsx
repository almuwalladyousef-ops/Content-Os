export const metadata = {
  title: 'Privacy Policy — ContentOS Flames',
  other: {
    'tiktok-developers-site-verification': ['DMhbnabVOvzI7IL9BjFtYgQd3h0d7kEf', 'kEqA6ckipEf1gCVT9rbHvAzvZ2C3gjoW'],
  },
}

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto w-full bg-surface rounded-2xl border border-border shadow-lg p-8 sm:p-10 text-text">
      <h1 className="text-3xl font-bold mb-2">ContentOS Flames — Privacy Policy</h1>
      <p className="text-text-muted text-sm mb-8">Last updated: May 24, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold mb-2">Overview</h2>
          <p>
            This Privacy Policy applies to <strong>ContentOS Flames</strong>, a video content publishing application
            (&ldquo;the App&rdquo;, &ldquo;the Service&rdquo;, &ldquo;we&rdquo;). ContentOS Flames lets a creator upload one
            video and post it to multiple platforms (YouTube, Instagram, TikTok). This policy explains what
            data ContentOS Flames handles, why, and how long we keep it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Data we collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Account identifiers</strong> from the platforms you connect (Google email, Instagram
              business account ID, TikTok display name). Used only to identify which account a post should go
              to.
            </li>
            <li>
              <strong>OAuth access &amp; refresh tokens</strong> for Google, Meta (Instagram), and TikTok.
              These let the Service post on your behalf. Tokens are stored in your own Google Drive
              (under a folder named ContentOS) — we do not run a central database.
            </li>
            <li>
              <strong>Video files you upload</strong>. These are temporarily stored in Vercel Blob storage,
              forwarded to each destination platform, and then deleted from Blob storage. We do not keep
              copies.
            </li>
            <li>
              <strong>Post history</strong> (filename, caption, destination URLs, timestamp) saved to your
              own Google Drive so you can review it later.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">How we use it</h2>
          <p>
            Solely to perform the actions you ask for: authenticate you, upload your video, post it to the
            platforms you select, and show you a history of what you posted. We do not analyze your content,
            sell data, or share it with third parties beyond the destination platforms you choose.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Third-party services</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Google (YouTube Data API, Drive API)</strong> — for YouTube uploads and token storage.</li>
            <li><strong>Meta (Instagram Graph API)</strong> — for Instagram Reels publishing.</li>
            <li><strong>TikTok Content Posting API</strong> — for TikTok uploads.</li>
            <li><strong>Vercel Blob</strong> — temporary video file hosting (auto-deleted after posting).</li>
            <li><strong>Vercel</strong> — application hosting.</li>
          </ul>
          <p className="mt-2">
            Each of these services has its own privacy policy that governs the data they receive.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Retention &amp; deletion</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Video files: deleted from Vercel Blob immediately after the post completes (or fails).</li>
            <li>Tokens and post history: stored in your own Google Drive. You can delete them at any time by removing the ContentOS folder from Drive.</li>
            <li>To fully disconnect, revoke access at: Google → <a className="text-primary underline" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>, Meta → Settings → Business Integrations, TikTok → Settings → Manage app permissions.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Your rights</h2>
          <p>
            You can request deletion of any data we hold by emailing the address below. Since most data is
            stored in your own Google Drive, you can also delete it directly there.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Contact</h2>
          <p>
            Questions or requests: <a className="text-primary underline" href="mailto:almuwalladyousef@gmail.com">almuwalladyousef@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  )
}
