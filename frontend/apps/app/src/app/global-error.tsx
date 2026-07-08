"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#F8F6F1", color: "#141414", fontFamily: "Inter, system-ui, sans-serif", margin: 0 }}>
        <div style={{ maxWidth: 480, margin: "20vh auto", textAlign: "center", padding: "0 24px" }}>
          <h1 style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 32, marginBottom: 12, fontWeight: 400 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#6B6660", lineHeight: 1.6, marginBottom: 24 }}>
            An unexpected error occurred. Your data is safe — try refreshing.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#141414", color: "#F8F6F1", border: "none", borderRadius: 8,
              padding: "10px 24px", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Try again
          </button>
          {process.env.NODE_ENV === "development" && (
            <pre style={{ marginTop: 32, textAlign: "left", fontSize: 12, color: "#8A857F", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {error.message}
            </pre>
          )}
        </div>
      </body>
    </html>
  );
}
