export const metadata = {
  title: 'Terms of Service — ContentOS Flames',
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto w-full bg-surface rounded-2xl border border-border shadow-lg p-8 sm:p-10 text-text">
      <h1 className="text-3xl font-bold mb-2">ContentOS Flames — Terms of Service</h1>
      <p className="text-text-muted text-sm mb-8">Last updated: May 24, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold mb-2">1. The Application</h2>
          <p>
            These Terms of Service govern your use of <strong>ContentOS Flames</strong>, a video content publishing
            application (&ldquo;the App&rdquo;, &ldquo;the Service&rdquo;). ContentOS Flames lets you upload one video and post
            it to multiple connected platforms (YouTube, Instagram, TikTok). By using ContentOS Flames you agree to
            these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">2. Eligibility &amp; accounts</h2>
          <p>
            You must be the rightful owner of the social-media accounts you connect, and you must comply
            with each platform&apos;s terms of service (YouTube, Meta/Instagram, TikTok). You are responsible
            for keeping your account credentials secure.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">3. Your content</h2>
          <p>
            You retain all rights to the videos and captions you post through the Service. You grant the
            Service only the limited permission needed to upload your content to the platforms you select.
            You are solely responsible for the legality and appropriateness of what you post.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">4. Acceptable use</h2>
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Post content that infringes copyright, trademark, or other rights;</li>
            <li>Post illegal, harassing, hateful, or sexually explicit material;</li>
            <li>Post spam, misleading content, or content that violates any destination platform&apos;s policies;</li>
            <li>Attempt to reverse engineer, abuse, or overload the Service.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">5. Third-party platforms</h2>
          <p>
            The Service relies on YouTube, Meta, TikTok, Vercel, and Google APIs. We are not responsible for
            outages, policy changes, or actions taken by these third parties. If a platform suspends or
            limits your account, that is between you and the platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">6. No warranty</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of any kind. We do not guarantee that posts
            will succeed, that videos will be retained, or that the Service will be available at any
            particular time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">7. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, the Service and its operator are not liable for any
            indirect, incidental, or consequential damages arising from your use of the Service, including
            but not limited to lost content, lost followers, or lost revenue.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">8. Termination</h2>
          <p>
            You may stop using the Service at any time by revoking its access in your Google, Meta, and
            TikTok account settings, and by deleting the ContentOS folder from your Google Drive. We may
            suspend access if these Terms are violated.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">9. Changes</h2>
          <p>
            We may update these Terms at any time. Continued use of the Service after changes means you
            accept the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">10. Contact</h2>
          <p>
            Questions: <a className="text-primary underline" href="mailto:almuwalladyousef@gmail.com">almuwalladyousef@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  )
}
