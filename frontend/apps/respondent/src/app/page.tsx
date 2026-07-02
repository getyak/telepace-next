import Link from "next/link";

export const metadata = { title: "Share your experience" };

export default function RespondentRoot() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="overline mb-4">powered by telepace</p>
        <h1 className="font-display text-5xl mb-6 leading-tight">Nothing to answer here.</h1>
        <p className="text-body text-lg leading-relaxed">
          You've reached the respondent gateway for telepace. Individual interviews live at
          their own private URLs.
        </p>
        <p className="text-body text-lg leading-relaxed mt-4">
          If someone shared a link with you, double-check it — the address usually looks
          like <code className="font-mono text-ink">/r/&lt;code&gt;</code>.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
          <Link
            href="https://telepace.io"
            className="h-11 px-5 inline-flex items-center justify-center rounded-btn bg-ink text-paper hover:bg-ink-soft"
          >
            Visit telepace.io
          </Link>
          <Link
            href="mailto:support@telepace.io"
            className="h-11 px-5 inline-flex items-center justify-center rounded-btn border border-hairline text-ink hover:bg-paper-elevated"
          >
            Contact support
          </Link>
        </div>
        <p className="text-xs text-muted mt-10">
          Your privacy matters. Read our{" "}
          <Link href="https://telepace.io/privacy" className="underline text-accent">privacy policy</Link>.
        </p>
      </div>
    </main>
  );
}
