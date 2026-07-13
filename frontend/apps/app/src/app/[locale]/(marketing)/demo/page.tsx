"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button, Card, ChatFeed, ChatComposer, type ChatMessage } from "@telepace/ui";
import { routes } from "@telepace/config";
import { PageHeader } from "@/components/marketing/site-chrome";
import { Link } from "@/i18n/navigation";

function useScript(): string[] {
  const t = useTranslations("marketing.demo.script");
  return [t("0"), t("1"), t("2"), t("3"), t("4")];
}

export default function DemoPage() {
  const t = useTranslations("marketing.demo");
  const script = useScript();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "0", role: "interviewer", text: script[0] },
  ]);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  function handleSend(text: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "respondent", text }]);
    const next = step + 1;
    setStep(next);
    setTimeout(() => {
      if (next >= script.length) {
        setDone(true);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "interviewer", text: script[next] },
      ]);
    }, 700);
  }

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={<>{t("title")}</>}
        lede={t("lede")}
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10">
          <div className="md:col-span-8">
            <Card className="overflow-hidden flex flex-col h-[560px]">
              <div className="flex items-center gap-2 border-b border-hairline px-5 py-3 text-xs text-muted">
                <div className="w-2 h-2 rounded-full bg-accent" />
                {t("statusLine", {
                  status: done
                    ? t("statusWrapped")
                    : t("statusQuestion", { current: step + 1, total: script.length }),
                })}
              </div>
              <div className="flex-1 overflow-y-auto px-5">
                <ChatFeed messages={messages} typingLabel={t("chat.typing")} />
              </div>
              {done ? (
                <div className="px-5 py-6 border-t border-hairline text-center">
                  <p className="font-display text-2xl mb-2">{t("done.title")}</p>
                  <p className="text-body text-sm mb-4">{t("done.body")}</p>
                  <Link href={routes.signup}><Button>{t("done.cta")}</Button></Link>
                </div>
              ) : (
                <ChatComposer
                  onSend={handleSend}
                  placeholder={t("chat.placeholder")}
                  sendLabel={t("chat.send")}
                />
              )}
            </Card>
          </div>
          <aside className="md:col-span-4 space-y-6">
            <Card className="p-6">
              <p className="overline mb-3">{t("hood.title")}</p>
              <ul className="text-sm text-body space-y-2">
                <li>· {t("hood.items.0")}</li>
                <li>· {t("hood.items.1")}</li>
                <li>· {t("hood.items.2")}</li>
                <li>· {t("hood.items.3")}</li>
              </ul>
            </Card>
            <Card className="bg-ink text-paper p-6">
              <p className="overline text-paper/70 mb-3">{t("voice.eyebrow")}</p>
              <p className="text-sm mb-4">{t("voice.body")}</p>
              <Link href={routes.product.voice}>
                <Button variant="inverse-outline">
                  {t("voice.cta")}
                </Button>
              </Link>
            </Card>
          </aside>
        </div>
      </section>
    </>
  );
}
