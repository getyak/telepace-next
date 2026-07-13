"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, ChatComposer, ChatFeed, type ChatMessage } from "@telepace/ui";

import { MOCK_STUDIES } from "./StudySelector";

const ANSWER_TEMPLATE_COUNT = 4;

export function CopilotChat({
  selectedStudyIds,
  placeholder,
  sendLabel,
  thinkingLabel,
}: {
  selectedStudyIds: string[];
  placeholder: string;
  sendLabel: string;
  thinkingLabel: string;
}) {
  const t = useTranslations("app.copilot");
  const locale = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const turnRef = useRef(0);

  function studyNames(): string {
    const chosen =
      selectedStudyIds.length === 0
        ? MOCK_STUDIES
        : MOCK_STUDIES.filter((s) => selectedStudyIds.includes(s.id));
    const names = chosen.map((s) => t(s.nameKey));
    if (names.length === 0) return t("studiesFallback");
    const lf = new Intl.ListFormat(locale, {
      style: "long",
      type: "conjunction",
    });
    return lf.format(names);
  }

  function handleSend(text: string) {
    if (busy) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "respondent",
      text,
    };
    const pendingId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: pendingId, role: "interviewer", text: "", pending: true },
    ]);
    setBusy(true);

    const n = (turnRef.current % ANSWER_TEMPLATE_COUNT) + 1;
    turnRef.current += 1;
    const answer = t(`answer${n}`, { studies: studyNames() });

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId ? { ...m, text: answer, pending: false } : m,
        ),
      );
      setBusy(false);
    }, 1500);
  }

  return (
    <Card className="flex min-h-[420px] flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5">
        <ChatFeed messages={messages} typingLabel={thinkingLabel} />
      </div>
      <ChatComposer
        onSend={handleSend}
        placeholder={placeholder}
        sendLabel={sendLabel}
        disabled={busy}
      />
    </Card>
  );
}
