"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";

type CodeBlockProps = {
  code: string;
  language?: string;
  title?: string;
};

export function CodeBlock({ code, language, title }: CodeBlockProps) {
  const t = useTranslations("app.integrations");
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [code]);

  return (
    <div className="rounded-card border border-hairline overflow-hidden">
      {(title || language) && (
        <div className="flex items-center justify-between bg-[#1E1E1E] px-4 py-2 border-b border-[#333]">
          <span className="text-xs text-[#999] font-mono">
            {title ?? language}
          </span>
          <button
            onClick={handleCopy}
            className={cn(
              "text-xs font-medium px-2 py-1 rounded-btn tp-press tp-press-control transition-[color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper/40",
              copied
                ? "text-success bg-success/10"
                : "text-[#999] hover:text-[#ccc] hover:bg-[#333]",
            )}
          >
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
      )}
      <div className="relative group">
        {!title && !language && (
          <button
            onClick={handleCopy}
            className={cn(
              "absolute top-3 right-3 text-xs font-medium px-2 py-1 rounded-btn tp-press tp-press-control transition-[color,background-color,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper/40",
              copied
                ? "text-success bg-success/10 opacity-100"
                : "text-[#999] hover:text-[#ccc] hover:bg-[#333] opacity-0 group-hover:opacity-100",
            )}
          >
            {copied ? t("copied") : t("copy")}
          </button>
        )}
        <pre className="bg-[#141414] p-4 overflow-x-auto">
          <code className="font-mono text-[13px] leading-relaxed text-[#D4D4D4] whitespace-pre">
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}
