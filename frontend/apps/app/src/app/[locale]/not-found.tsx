import { getLocale } from "next-intl/server";
import Link from "next/link";

const copy = {
  en: {
    code: "404",
    title: "This page doesn't exist.",
    description:
      "The link may be broken, or the page may have moved. Let's get you back on track.",
    home: "Back to studies",
  },
  zh: {
    code: "404",
    title: "此页面不存在。",
    description: "链接可能已失效，或页面已移动。我们带你回到正轨。",
    home: "返回研究",
  },
} as const;

export default async function NotFound() {
  const locale = await getLocale();
  const c = locale.toLowerCase().startsWith("zh") ? copy.zh : copy.en;

  return (
    <div className="mx-auto flex min-h-screen max-w-content flex-col items-center justify-center p-6 text-center md:p-10">
      <p className="overline mb-2 text-muted">{c.code}</p>
      <h1 className="font-display text-4xl md:text-5xl">{c.title}</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-body">
        {c.description}
      </p>
      <Link
        href={`/${locale}`}
        className="tp-press tp-press-control mt-8 inline-flex items-center justify-center rounded-btn bg-accent px-5 py-2.5 text-sm font-medium text-paper transition-[color,background-color,transform] hover:bg-accent/90"
      >
        {c.home}
      </Link>
    </div>
  );
}
