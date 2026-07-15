// Error boundaries render OUTSIDE the layouts' NextIntlClientProvider, so
// useTranslations is unavailable inside them. Copy is hardcoded bilingual and
// keyed off the <html lang> the root layout set.
//
// Shared by every route group's error.tsx so the four surfaces can't drift
// apart in wording or locale handling.

export type ErrorCopy = {
  title: string;
  description: string;
  retry: string;
};

export const errorCopy: Record<"en" | "zh", ErrorCopy> = {
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
};

export function useErrorCopy(): ErrorCopy {
  const lang =
    typeof document !== "undefined"
      ? document.documentElement.lang.toLowerCase()
      : "en";
  return lang.startsWith("zh") ? errorCopy.zh : errorCopy.en;
}
