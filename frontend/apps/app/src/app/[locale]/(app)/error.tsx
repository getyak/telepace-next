"use client";

// Error boundaries render OUTSIDE the (app) layout's NextIntlClientProvider,
// so useTranslations is unavailable here — copy is hardcoded bilingual and
// keyed off the <html lang> the root layout set.
import { useEffect } from "react";
import { Button, EmptyState } from "@telepace/ui";

const copy = {
  en: {
    title: "Something went wrong.",
    description:
      "This surface hit an unexpected error. Try again — if it keeps happening, the issue is on our side.",
    retry: "Try again",
  },
  zh: {
    title: "出了点问题。",
    description: "这个页面遇到了意外错误。请重试——如果反复出现，问题在我们这边。",
    retry: "重试",
  },
} as const;

function useLocaleCopy() {
  const lang =
    typeof document !== "undefined"
      ? document.documentElement.lang.toLowerCase()
      : "en";
  return lang.startsWith("zh") ? copy.zh : copy.en;
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const c = useLocaleCopy();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-content items-center justify-center p-6 md:p-10">
      <EmptyState
        className="w-full"
        title={c.title}
        description={c.description}
        action={<Button onClick={reset}>{c.retry}</Button>}
      />
    </div>
  );
}
