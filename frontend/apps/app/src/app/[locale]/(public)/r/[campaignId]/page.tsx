"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";

// Locales the respondent UI can render. The interview's content language (from
// the WS hello) is authoritative; if the URL locale disagrees we switch to it
// so greetings/progress/prompts match the question text instead of clashing.
const SUPPORTED_LOCALES = ["en", "zh"] as const;
import {
  Button,
  Card,
  TextStage,
  VoiceStage,
  cn,
  type ChatMessage,
  type VoicePhase,
} from "@telepace/ui";
import {
  env,
  OPUS_CHUNK_MS,
  SPEAKING_INDICATOR_MS,
  VOICE_MIME,
  VoiceEventType,
  wsEndpoints,
} from "@telepace/config";

import { getRespondentCampaign, type RespondentCampaignInfo } from "@/lib/api";

type Params = { campaignId: string; locale: string };

type Progress = { current: number | null; total: number };

// The completion copy actually shown on "done" — WS wrap_up payload wins
// (freshest, matches what this respondent just experienced); falls back to
// the pre-fetched public campaign info when the WS never sent it.
type CompletionCopy = {
  end_message?: string;
  reward_description?: string;
  redirect_url?: string;
};

const WRAP_UP_LINGER_MS = 2400;
// If the interviewer hasn't replied in this window, unlock the composer so a
// slow/hung model can never trap the respondent.
const REPLY_WATCHDOG_MS = 45000;
// How long the "thanks" screen holds before following a configured redirect —
// long enough to read the thank-you copy, short enough not to feel stuck.
const THANKS_REDIRECT_DELAY_S = 5;

export default function RespondentPage(props: { params: Promise<Params> }) {
  const t = useTranslations("respondent");
  const { campaignId, locale } = use(props.params);
  const router = useRouter();
  const pathname = usePathname();
  // Guard so a locale switch fires at most once (it remounts the page).
  const localeAlignedRef = useRef(false);
  const [phase, setPhase] = useState<"consent" | "chat" | "voice" | "done">("consent");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [progress, setProgress] = useState<Progress>({ current: null, total: 0 });
  const [awaiting, setAwaiting] = useState(false);
  // Set when the mic can't be accessed in voice mode — the orb alone leaves the
  // respondent stuck on "connecting…" with no visible reason or way out, so we
  // surface a banner + a one-tap fallback to the text interview.
  const [micDenied, setMicDenied] = useState(false);
  // Voice-mode UI: the respondent taps the orb to start/stop capture, and can
  // silence or replay the interviewer's read-aloud.
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [readAloud, setReadAloud] = useState(true);
  // The study's configured welcome/consent/end/reward/redirect copy, fetched
  // once up front (public, no auth) so the consent screen can show it before
  // any WS connects. null while loading/unavailable — components fall back
  // to their default bilingual copy.
  const [publicInfo, setPublicInfo] = useState<RespondentCampaignInfo | null>(null);
  // The wrap_up turn's own end/reward/redirect fields, when the WS sent them —
  // takes priority over publicInfo since it reflects this exact session.
  const [completion, setCompletion] = useState<CompletionCopy>({});
  const answeredRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const audioBusyRef = useRef(false);
  // The last interviewer TTS clip, kept so "replay" can play it again without a
  // round-trip. readAloudRef mirrors the toggle for use inside the WS closure
  // (which captures state once at mount).
  const lastClipRef = useRef<Blob | null>(null);
  const readAloudRef = useRef(true);
  const voicePhaseRef = useRef<VoicePhase>("idle");
  // The active WS's playNextAudio, published by the voice effect so the replay
  // control can drive playback from outside the effect closure.
  const playNextAudioRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    readAloudRef.current = readAloud;
  }, [readAloud]);
  useEffect(() => {
    voicePhaseRef.current = voicePhase;
  }, [voicePhase]);

  // Fetch the study's respondent-facing copy once, up front — before the
  // respondent has consented to anything, so this call carries no auth and
  // reads only the public subset of the spec (see the backend endpoint).
  // A failure (network hiccup, study not found) just leaves publicInfo null
  // and every consumer below falls back to its default bilingual copy.
  useEffect(() => {
    let cancelled = false;
    getRespondentCampaign(campaignId)
      .then((info) => {
        if (!cancelled) setPublicInfo(info);
      })
      .catch(() => {
        /* default copy is a fine fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

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
        language?: string;
        progress?: { question_order?: number | null; total_questions?: number };
        result?: {
          text?: string;
          kind?: string;
          progress?: { question_order?: number | null; total_questions?: number };
          end_message?: string;
          reward_description?: string;
          redirect_url?: string;
        };
      };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === VoiceEventType.Hello) {
        // Align the page locale to the study's content language so the host's
        // greeting, progress, and prompts speak the same language as the
        // questions. Fires at most once; a no-op when they already agree.
        const lang = msg.language;
        if (
          lang &&
          !localeAlignedRef.current &&
          (SUPPORTED_LOCALES as readonly string[]).includes(lang) &&
          lang !== locale
        ) {
          localeAlignedRef.current = true;
          router.replace(pathname, { locale: lang });
          return;
        }
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
          setCompletion({
            end_message: msg.result.end_message,
            reward_description: msg.result.reward_description,
            redirect_url: msg.result.redirect_url,
          });
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
  }, [phase, campaignId, retryKey, locale, router, pathname]);

  // Watchdog: never leave the respondent stuck on a silent interviewer.
  useEffect(() => {
    if (!awaiting) return;
    const timer = window.setTimeout(() => {
      setAwaiting(false);
      setMessages((prev) => [
        ...prev.filter((m) => !m.pending),
        {
          id: crypto.randomUUID(),
          role: "system",
          text: t("errors.watchdog"),
        },
      ]);
    }, REPLY_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [awaiting, t]);

  // --- Voice-mode WS (unchanged transport; progress not available here) ---
  useEffect(() => {
    if (phase !== "voice") return;
    let cancelled = false;
    const ws = new WebSocket(`${env.wsBaseUrl}${wsEndpoints.voice(campaignId)}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    const enqueueAudio = (blob: Blob) => {
      // Always keep the latest clip so "replay" works even when read-aloud is
      // off — the respondent can choose to hear it on demand.
      lastClipRef.current = blob;
      // Respect the read-aloud toggle: when muted, we keep the clip for replay
      // but don't auto-play it.
      if (!readAloudRef.current) return;
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
    // Exposed to the tap handler so "replay" can re-queue the last clip.
    playNextAudioRef.current = playNextAudio;

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
        // Capture is now tap-driven (see onOrbTap), not auto-started on open —
        // the respondent controls exactly when they're on the record, mirroring
        // the Listen Labs "tap to speak" affordance.
      } catch (err) {
        console.error("mic permission denied", err);
        // Surface it in the voice stage (a banner + fallback button), not only
        // as a chat line the orb view never shows.
        setMicDenied(true);
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
        end_message?: string;
        reward_description?: string;
        redirect_url?: string;
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
              setCompletion({
                end_message: msg.end_message,
                reward_description: msg.reward_description,
                redirect_url: msg.redirect_url,
              });
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
            // Transcript landed — the send round-trip is done, release the orb.
            setVoicePhase("idle");
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

  // Tap the orb: idle → start capturing; recording → stop + flush + await the
  // transcript. A guarded no-op if the recorder isn't ready yet.
  const onOrbTap = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (voicePhaseRef.current === "idle") {
      try {
        recorder.start(OPUS_CHUNK_MS);
        setVoicePhase("recording");
      } catch {
        /* already recording — ignore */
      }
    } else if (voicePhaseRef.current === "recording") {
      try {
        recorder.stop();
      } catch {
        /* not recording — ignore */
      }
      answeredRef.current += 1;
      // Wait for the STT transcript to flip us back to idle (see SttDelta).
      setVoicePhase("sending");
    }
  }, []);

  // Replay the interviewer's last question: re-queue the saved clip and play,
  // even when read-aloud is toggled off (an explicit, on-demand listen).
  const replayQuestion = useCallback(() => {
    const clip = lastClipRef.current;
    if (!clip) return;
    audioQueueRef.current.push(clip);
    playNextAudioRef.current?.();
  }, []);

  if (phase === "consent") {
    return (
      <Consent
        onStart={(m) => {
          setMode(m);
          setPhase(m === "voice" ? "voice" : "chat");
        }}
        welcomeMessage={publicInfo?.welcome_message}
        consentText={publicInfo?.consent_text}
      />
    );
  }
  if (phase === "done")
    return (
      <Thanks
        answered={answeredRef.current}
        endMessage={completion.end_message || publicInfo?.end_message}
        rewardDescription={completion.reward_description || publicInfo?.reward_description}
        redirectUrl={completion.redirect_url || publicInfo?.redirect_url}
      />
    );

  if (mode === "voice") {
    // The question is the interviewer's most recent line; before any line
    // arrives, show the gentle intro. Respondent transcripts never become the
    // question — the stage always reflects what's being asked.
    const lastQuestion =
      [...messages].reverse().find((m) => m.role === "interviewer")?.text ??
      t("chat.voiceIntro");
    const hasQuestion = messages.some((m) => m.role === "interviewer");
    return (
      <div className="flex min-h-screen flex-col">
        <ProgressBar progress={progress} />
        {micDenied && (
          <div
            role="alert"
            className="mx-auto mt-4 flex w-[min(90vw,32rem)] flex-wrap items-center justify-between gap-3 rounded-btn border border-hairline bg-paper-sunken px-4 py-3 text-sm shadow-overlay"
          >
            <span className="text-body">{t("voice.micDeniedBanner")}</span>
            <button
              onClick={() => {
                setMicDenied(false);
                setMode("text");
                setPhase("chat");
              }}
              className="shrink-0 rounded-btn bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {t("voice.switchToText")}
            </button>
          </div>
        )}
        <VoiceStage
          question={lastQuestion}
          phase={voicePhase}
          speaking={speaking}
          connected={connected}
          onOrbTap={onOrbTap}
          labels={{
            idle: t("voice.tapToSpeak"),
            recording: t("voice.tapToSend"),
            sending: t("voice.sending"),
            speaking: t("chat.speaking"),
            connecting: t("chat.connecting"),
            orbSpeaking: t("chat.speaking"),
            orbListening: t("voice.tapToSpeak"),
            orbRecording: t("voice.tapToSend"),
          }}
          readAloud={readAloud}
          onToggleReadAloud={() => setReadAloud((v) => !v)}
          readAloudLabel={t("voice.readAloud")}
          onReplay={hasQuestion ? replayQuestion : undefined}
          replayLabel={t("voice.replay")}
        />
      </div>
    );
  }

  // Derive the stage's three inputs from the message log:
  // - the current question (last non-pending interviewer line),
  // - whether the interviewer is still composing (a trailing pending line),
  // - the respondent's most recent reply (the fading echo above the question).
  let currentQuestion = "";
  let questionPending = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "interviewer") {
      if (messages[i].pending) questionPending = true;
      else {
        currentQuestion = messages[i].text;
        break;
      }
    }
  }
  const lastReply = [...messages].reverse().find((m) => m.role === "respondent")?.text ?? null;
  const stagePending = questionPending || (messages.length === 0 && connected);

  return (
    // The full viewport IS the stage: warm paper, one hero question centered in
    // a sea of whitespace, a bare writing line — Listen Labs' single-question
    // focus, rebuilt in serif-on-paper with a sage rail and a warm receipt the
    // cold-blue reference never offers. No card, no chrome: nothing frames the
    // question, so it reads as the only thing in the room. A whisper of grain
    // gives the paper material presence across a wide desktop.
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-paper">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35] mix-blend-multiply tp-paper-grain"
      />
      {/* A hairline progress rule pinned to the very top edge — the only chrome.
          It says "there's a path and you're on it" without a bar taking space. */}
      <TopProgressRule progress={progress} />

      {/* Brand mark, top-left, whisper-quiet — presence without a masthead bar. */}
      <div className="pointer-events-none absolute left-6 top-5 z-10 flex items-center gap-2 sm:left-9 sm:top-7">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="font-display text-[15px] text-ink">{t("masthead.title")}</span>
      </div>

      {dropped && (
        <div className="absolute left-1/2 top-16 z-20 w-[min(90vw,28rem)] -translate-x-1/2">
          <Card
            role="alert"
            className="flex items-center justify-between px-4 py-2.5 shadow-overlay"
          >
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink tp-pulse-slow"
              />
              <p className="text-sm text-body">{t("connection.lost")}</p>
            </span>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="rounded-btn text-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {t("connection.reconnect")}
            </button>
          </Card>
        </div>
      )}

      <div className="relative flex flex-1 flex-col">
        <TextStage
          question={currentQuestion}
          lastReply={lastReply}
          pending={stagePending}
          connected={connected}
          onSend={sendReply}
          disabled={!connected || awaiting}
          placeholder={awaiting ? t("chat.waiting") : t("chat.placeholder")}
          sendLabel={t("chat.send")}
          hintLabel={t("chat.enterHint")}
          textareaLabel={t("chat.inputLabel")}
          bylineLabel={t("chat.researcher")}
          receiptLabel={t("chat.captured")}
          connectingLabel={t("chat.connecting")}
          typingLabel={t("chat.typing")}
        />
      </div>

      {/* Bottom-right: a quiet "where am I" counter — the linear-interview answer
          to Listen Labs' page arrows. Muted, tabular, never pulls focus. */}
      {progress.total > 0 && (
        <div className="pointer-events-none absolute bottom-6 right-6 z-10 sm:bottom-8 sm:right-9">
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {t("progress.questionOf", {
              current: Math.min(progress.current ?? 1, progress.total),
              total: progress.total,
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function Consent({
  onStart,
  welcomeMessage,
  consentText,
}: {
  onStart: (mode: "text" | "voice") => void;
  welcomeMessage?: string;
  consentText?: string;
}) {
  const t = useTranslations("respondent.consent");
  // Only gate on an explicit checkbox when the researcher configured real
  // consent copy — legacy/unconfigured studies keep the original passive
  // disclaimer instead of gaining a new required step out of nowhere.
  const requireConsent = !!consentText;
  const [consented, setConsented] = useState(false);
  const canStart = !requireConsent || consented;
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="tp-fade-in-up max-w-lg text-center">
        <p className="overline mb-4">{t("eyebrow")}</p>
        <h1 className="mb-6 font-display text-5xl leading-tight">{t("title")}</h1>
        <p className="text-lg leading-relaxed text-body">{welcomeMessage || t("body")}</p>
        {requireConsent && (
          <label className="mx-auto mt-6 flex max-w-sm items-start gap-3 text-left text-sm text-body">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-accent"
            />
            <span>{consentText}</span>
          </label>
        )}
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="primary" size="lg" disabled={!canStart} onClick={() => onStart("text")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 6h16M4 12h16M4 18h10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            {t("startWithText")}
          </Button>
          <Button variant="secondary" size="lg" disabled={!canStart} onClick={() => onStart("voice")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="9"
                y="3"
                width="6"
                height="11"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M6 11a6 6 0 0 0 12 0M12 17v3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            {t("useVoice")}
          </Button>
        </div>
        <p className="mx-auto mt-6 max-w-sm text-xs text-muted">
          {requireConsent ? t("consentCheckRequired") : t("consentNotice")}
        </p>
      </div>
    </div>
  );
}

function Thanks({
  answered,
  endMessage,
  rewardDescription,
  redirectUrl,
}: {
  answered: number;
  endMessage?: string;
  rewardDescription?: string;
  redirectUrl?: string;
}) {
  const t = useTranslations("respondent.thanks");
  const [secondsLeft, setSecondsLeft] = useState(THANKS_REDIRECT_DELAY_S);

  useEffect(() => {
    if (!redirectUrl) return;
    if (secondsLeft <= 0) {
      window.location.href = redirectUrl;
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [redirectUrl, secondsLeft]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg text-center tp-fade-in-up">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="overline mb-4">{t("eyebrow")}</p>
        <h1 className="font-display text-5xl mb-6 leading-tight">{t("title")}</h1>
        <p className="text-body text-lg leading-relaxed">
          {endMessage || (answered > 0 ? t("withAnswers", { count: answered }) : t("noAnswers"))}
        </p>
        {rewardDescription && (
          <p className="mt-4 text-body text-base">{t("reward", { reward: rewardDescription })}</p>
        )}
        {redirectUrl ? (
          <p className="text-xs text-muted mt-6">
            {t("redirecting", { seconds: secondsLeft })}{" "}
            <a href={redirectUrl} className="text-accent underline">
              {t("continueNow")}
            </a>
          </p>
        ) : (
          <p className="text-xs text-muted mt-6">{t("canClose")}</p>
        )}
      </div>
    </div>
  );
}

/**
 * A single hairline progress rule pinned to the very top edge of the stage — the
 * only chrome in the full-viewport text interview. It fills left-to-right in
 * sage as questions are answered, saying "there is a path, and you're on it"
 * without spending any vertical space or ink on a labelled bar. Accessible as a
 * real progressbar; degrades to nothing before the total is known.
 */
function TopProgressRule({ progress }: { progress: Progress }) {
  const t = useTranslations("respondent.progress");
  if (!progress.total) return null;
  const current = Math.min(progress.current ?? 1, progress.total);
  const pct = Math.round((current / progress.total) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={progress.total}
      aria-valuetext={t("questionOf", { current, total: progress.total })}
      className="fixed inset-x-0 top-0 z-30 h-[3px] bg-transparent"
    >
      <div
        className="h-full w-full origin-left bg-accent transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}

function ProgressBar({ progress, embedded }: { progress: Progress; embedded?: boolean }) {
  const t = useTranslations("respondent.progress");
  if (!progress.total) {
    return embedded ? null : <div className="py-6" />;
  }
  const current = Math.min(progress.current ?? 1, progress.total);
  const pct = Math.round((current / progress.total) * 100);
  // A segmented spine — one pip per question — reads as a journey with a known
  // length, not just a bar filling up. Capped so a long study stays a bar.
  const useSegments = progress.total <= 12;
  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={progress.total}
      aria-valuetext={t("questionOf", { current, total: progress.total })}
      className={cn(
        // Standalone (voice mode): a sticky translucent bar over the page with
        // a rule. Embedded (stage card): NO bottom rule — the progress dissolves
        // into whitespace so the card reads as one continuous sheet, not a stack
        // of ruled drawers.
        embedded
          ? "bg-transparent"
          : "sticky top-0 z-20 border-b border-hairline tp-chrome",
      )}
    >
      <div className={cn("w-full py-3.5", embedded ? "px-6 sm:px-8" : "mx-auto max-w-xl px-6")}>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="overline">{t("questionOf", { current, total: progress.total })}</p>
          <span className="font-mono text-[11px] tabular-nums text-muted">{pct}%</span>
        </div>
        {useSegments ? (
          <div className="flex gap-1.5">
            {Array.from({ length: progress.total }).map((_, i) => {
              const done = i < current - 1;
              const active = i === current - 1;
              return (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-pill transition-colors duration-500",
                    done && "bg-accent",
                    active && "bg-accent/60",
                    !done && !active && "bg-hairline",
                  )}
                />
              );
            })}
          </div>
        ) : (
          <div className="h-1 w-full overflow-hidden rounded-pill bg-hairline">
            <div
              className="h-full w-full origin-left rounded-pill bg-accent transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
