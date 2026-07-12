"use client";

import { useRef, useState } from "react";
import { Card, ChatComposer, ChatFeed, type ChatMessage } from "@telepace/ui";

import { MOCK_STUDIES } from "./StudySelector";

const CROSS_STUDY_ANSWERS = [
  "Across the studies you selected, pricing friction is the dominant theme. In {studies}, respondents repeatedly tie the $79 tier to a lack of SSO — the objection shows up in 11 of 34 completed interviews.",
  "Two of the studies point the same direction: onboarding stalls after email confirmation. The pattern in {studies} suggests people never receive a clear next step, so activation drops within 48 hours.",
  "Comparing {studies}, the MCP integration is the strongest expansion driver — it's the single feature respondents cite unprompted when explaining why they upgraded.",
  "Synthesizing {studies}: churned users and active power-users describe the same gap. The difference is timing — power-users hit the wall later, which buys you a window to intervene.",
];

function studyNames(selectedIds: string[]): string {
  const chosen =
    selectedIds.length === 0
      ? MOCK_STUDIES
      : MOCK_STUDIES.filter((s) => selectedIds.includes(s.id));
  const names = chosen.map((s) => s.name);
  if (names.length <= 1) return names[0] ?? "your studies";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const turnRef = useRef(0);

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

    const template =
      CROSS_STUDY_ANSWERS[turnRef.current % CROSS_STUDY_ANSWERS.length];
    turnRef.current += 1;
    const answer = template.replace("{studies}", studyNames(selectedStudyIds));

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
