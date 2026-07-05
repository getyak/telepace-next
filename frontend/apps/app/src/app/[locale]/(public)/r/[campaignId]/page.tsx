"use client";

import { use, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChatFeed, ChatComposer, VoiceOrb, type ChatMessage } from "@telepace/ui";
import {
  env,
  OPUS_CHUNK_MS,
  SPEAKING_INDICATOR_MS,
  VOICE_MIME,
  VoiceEventType,
  wsEndpoints,
} from "@telepace/config";

type Params = { campaignId: string; locale: string };

type Progress = { current: number | null; total: number };

const WRAP_UP_LINGER_MS = 2400;
// If the interviewer hasn't replied in this window, unlock the composer so a
// slow/hung model can never trap the respondent.
const REPLY_WATCHDOG_MS = 45000;

export default function RespondentPage(props: { params: Promise<Params> }) {
  const t = useTranslations("respondent");
  const { campaignId } = use(props.params);
  const [phase, setPhase] = useState<"consent" | "chat" | "voice" | "done">("consent");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [progress, setProgress] = useState<Progress>({ current: null, total: 0 });
  const [awaiting, setAwaiting] = useState(false);
  const answeredRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const audioBusyRef = useRef(false);

  // --- Text-mode WS ---
  useEffect(() => {
    if (phase !== "chat") return;
    let closedByUs = false;
    const ws = new WebSocket(`${env.wsBaseUrl}${wsEndpoints.interview(campaignId)}`);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      setDropped(false);
    };
    ws.onclose = () => {
      setConnected(false);
      // Distinguish our own teardown from a dropped connection mid-interview.
      if (!closedByUs) setDropped(true);
    };
    ws.onerror = () => {
      setConnected(false);
    };
    ws.onmessage = async (evt) => {
      // Backend sends JSON as binary frames (send_bytes) — browsers deliver
      // those as Blob, which JSON.parse can't take directly.
      const raw = typeof evt.data === "string" ? evt.data : await (evt.data as Blob).text();
      let msg: {
        type: string;
        opening?: string;
        progress?: { question_order?: number | null; total_questions?: number };
        result?: {
          text?: string;
          kind?: string;
          progress?: { question_order?: number | null; total_questions?: number };
        };
      };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === VoiceEventType.Hello) {
        if (msg.progress?.total_questions) {
          setProgress({
            current: msg.progress.question_order ?? 1,
            total: msg.progress.total_questions,
          });
        }
        const opening = msg.opening;
        if (opening) {
          setMessages((prev) =>
            prev.length === 0
              ? [{ id: crypto.randomUUID(), role: "interviewer", text: opening }]
              : prev,
          );
        }
        return;
      }
      const turnText = msg.result?.text;
      if (msg.type === VoiceEventType.InterviewerTurn && turnText) {
        setSpeaking(true);
        setAwaiting(false);
        setMessages((prev) => [
          ...prev.filter((m) => !m.pending),
          { id: crypto.randomUUID(), role: "interviewer", text: turnText },
        ]);
        const turnProgress = msg.result?.progress;
        if (turnProgress?.total_questions) {
          setProgress((p) => ({
            current: turnProgress.question_order ?? p.current,
            total: turnProgress.total_questions!,
          }));
        }
        window.setTimeout(() => setSpeaking(false), SPEAKING_INDICATOR_MS);
        if (msg.result?.kind === VoiceEventType.WrapUp) {
          // Let the closing line land before the thank-you screen.
          window.setTimeout(() => setPhase("done"), WRAP_UP_LINGER_MS);
        }
      }
      if (msg.type === VoiceEventType.Error) {
        setAwaiting(false);
        setMessages((prev) => [
          ...prev.filter((m) => !m.pending),
          {
            id: crypto.randomUUID(),
            role: "system",
            text: t("errors.hiccup"),
          },
        ]);
      }
    };
    return () => {
      closedByUs = true;
      ws.close();
    };
  }, [phase, campaignId, retryKey]);

  // Watchdog: never leave the respondent stuck on a silent interviewer.
  useEffect(() => {
    if (!awaiting) return;
    const t = window.setTimeout(() => {
      setAwaiting(false);
      setMessages((prev) => [
        ...prev.filter((m) => !m.pending),
        {
          id: crypto.randomUUID(),
          role: "system",
          text: "This is taking longer than usual — feel free to send your answer again.",
        },
      ]);
    }, REPLY_WATCHDOG_MS);
    return () => window.clearTimeout(t);
  }, [awaiting]);

  // --- Voice-mode WS (unchanged transport; progress not available here) ---
  useEffect(() => {
    if (phase !== "voice") return;
    let cancelled = false;
    const ws = new WebSocket(`${env.wsBaseUrl}${wsEndpoints.voice(campaignId)}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    const enqueueAudio = (blob: Blob) => {
      audioQueueRef.current.push(blob);
      void playNextAudio();
    };

    const playNextAudio = async () => {
      if (audioBusyRef.current) return;
      const next = audioQueueRef.current.shift();
      if (!next) return;
      audioBusyRef.current = true;
      const url = URL.createObjectURL(next);
      const el = audioElRef.current ?? new Audio();
      audioElRef.current = el;
      el.src = url;
      try {
        await el.play();
      } catch {
        /* autoplay blocked — user gesture required */
      }
      el.onended = () => {
        URL.revokeObjectURL(url);
        audioBusyRef.current = false;
        void playNextAudio();
      };
    };

    ws.onopen = async () => {
      setConnected(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        const recorder = new MediaRecorder(stream, { mimeType: VOICE_MIME });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ev.data.arrayBuffer().then((buf) => ws.send(buf));
          }
        };
        recorder.start(OPUS_CHUNK_MS);
      } catch (err) {
        console.error("mic permission denied", err);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            text: t("errors.micDenied"),
          },
        ]);
      }
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data !== "string") {
        // Binary MP3 chunk from TTS
        enqueueAudio(new Blob([evt.data], { type: "audio/mpeg" }));
        return;
      }
      let msg: {
        type: string;
        text?: string;
        kind?: string;
        is_final?: boolean;
        reason?: string;
      };
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case VoiceEventType.InterviewerTurn:
          if (msg.text) {
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "interviewer", text: msg.text! },
            ]);
            if (msg.kind === VoiceEventType.WrapUp) {
              window.setTimeout(() => setPhase("done"), WRAP_UP_LINGER_MS);
            }
          }
          break;
        case VoiceEventType.SttDelta:
          if (msg.is_final && msg.text) {
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "respondent", text: msg.text! },
            ]);
          }
          break;
        case VoiceEventType.TtsStart:
          setSpeaking(true);
          break;
        case VoiceEventType.TtsEnd:
          setSpeaking(false);
          break;
        case VoiceEventType.Error:
          console.error("voice ws error", msg.reason);
          break;
      }
    };

    ws.onclose = () => setConnected(false);

    return () => {
      cancelled = true;
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* noop */
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      mediaRecorderRef.current = null;
      audioQueueRef.current = [];
      audioBusyRef.current = false;
      ws.close();
    };
  }, [phase, campaignId]);

  function sendReply(text: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "respondent", text }]);
    answeredRef.current += 1;
    // Text composer only makes sense in text mode; voice mode ignores it.
    if (mode === "text") {
      wsRef.current?.send(JSON.stringify({ type: VoiceEventType.Reply, text }));
      setAwaiting(true);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "interviewer", text: "", pending: true },
      ]);
    }
  }

  if (phase === "consent") {
    return (
      <Consent
        onStart={(m) => {
          setMode(m);
          setPhase(m === "voice" ? "voice" : "chat");
        }}
      />
    );
  }
  if (phase === "done") return <Thanks answered={answeredRef.current} />;

  if (mode === "voice") {
    return (
      <div className="min-h-screen flex flex-col">
        <ProgressBar progress={progress} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <VoiceOrb speaking={speaking} />
          <p className="text-body max-w-md text-center text-lg">
            {messages[messages.length - 1]?.text ?? t("chat.voiceIntro")}
          </p>
          {!connected && <p className="text-sm text-muted">{t("chat.connecting")}</p>}
        </div>
        <div className="p-4 border-t border-hairline">
          <ChatComposer
            onSend={sendReply}
            placeholder={t("chat.placeholder")}
            sendLabel={t("chat.send")}
            disabled={!connected}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ProgressBar progress={progress} />
      {dropped && (
        <div className="mx-auto w-full max-w-2xl px-6">
          <div className="mb-2 flex items-center justify-between rounded-card border border-hairline bg-paper-sunken px-4 py-2.5">
            <p className="text-sm text-body">{t("connection.lost")}</p>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="text-sm text-accent hover:underline"
            >
              {t("connection.reconnect")}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full px-6">
        <ChatFeed messages={messages} typingLabel={t("chat.typing")} />
      </div>
      <div className="w-full max-w-2xl mx-auto">
        <ChatComposer
          onSend={sendReply}
          disabled={!connected || awaiting}
          placeholder={awaiting ? t("chat.waiting") : t("chat.placeholder")}
          sendLabel={t("chat.send")}
        />
      </div>
    </div>
  );
}

function Consent({ onStart }: { onStart: (mode: "text" | "voice") => void }) {
  const t = useTranslations("respondent.consent");
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="overline mb-4">{t("eyebrow")}</p>
        <h1 className="font-display text-5xl mb-6 leading-tight">
          {t("title")}
        </h1>
        <p className="text-body text-lg leading-relaxed">
          {t("body")}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => onStart("text")}
            className="h-12 px-6 rounded-btn bg-ink text-paper hover:bg-ink-soft"
          >
            {t("startWithText")}
          </button>
          <button
            onClick={() => onStart("voice")}
            className="h-12 px-6 rounded-btn border border-hairline text-ink hover:bg-paper-elevated"
          >
            {t("useVoice")}
          </button>
        </div>
        <p className="text-xs text-muted mt-6 max-w-sm mx-auto">
          {t("consentNotice")}
        </p>
      </div>
    </div>
  );
}

function Thanks({ answered }: { answered: number }) {
  const t = useTranslations("respondent.thanks");
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="overline mb-4">{t("eyebrow")}</p>
        <h1 className="font-display text-5xl mb-6 leading-tight">{t("title")}</h1>
        <p className="text-body text-lg leading-relaxed">
          {answered > 0 ? t("withAnswers", { count: answered }) : t("noAnswers")}
        </p>
        <p className="text-xs text-muted mt-6">{t("canClose")}</p>
      </div>
    </div>
  );
}

function ProgressBar({ progress }: { progress: Progress }) {
  const t = useTranslations("respondent.progress");
  if (!progress.total) {
    return <div className="py-6" />;
  }
  const current = Math.min(progress.current ?? 1, progress.total);
  const pct = Math.round((current / progress.total) * 100);
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-6">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="overline">
          {t("questionOf", { current, total: progress.total })}
        </p>
        <span className="font-mono text-[11px] text-muted">{pct}%</span>
      </div>
      <div className="h-0.5 w-full overflow-hidden rounded-pill bg-hairline">
        <div
          className="h-full rounded-pill bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
