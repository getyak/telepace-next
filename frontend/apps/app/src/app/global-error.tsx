"use client";

// Root catch-all: fires when the root layout itself throws, so it must render
// its own <html>/<body> and cannot rely on globals.css (the failing layout is
// what imports it). Everything is inline-styled and bilingual.
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F8F6F1",
          color: "#1a1a1a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Something went wrong · 出了点问题
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#4a4a4a",
            }}
          >
            The application hit an unexpected error. Please try again.
            <br />
            应用遇到了意外错误，请重试。
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              fontSize: "0.9rem",
              fontWeight: 500,
              color: "#F8F6F1",
              backgroundColor: "#4A5D3B",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Try again · 重试
          </button>
        </div>
      </body>
    </html>
  );
}
