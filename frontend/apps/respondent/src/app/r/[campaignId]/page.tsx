"use client";

import { use, useEffect, useRef, useState } from "react";
import { ChatFeed, ChatComposer, VoiceOrb, type ChatMessage } from "@telepace/ui";
import { env, wsEndpoints } from "@telepace/config";

type Params = { campaignId: string };

export default function RespondentPage(props: { params: Promise<Params> }) {
  const { campaignId } = use(props.params);
  const [phase, setPhase] = useState<"consent" | "chat" | "voice" | "done">("consent");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const audioBusyRef = useRef(false);

  // --- Text-mode WS (unchanged) ---
  useEffect(() => {
    if (phase !== "chat") return;
    const ws = new WebSocket(`${env.wsBaseUrl}${wsEndpoints.interview(campaignId)}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === "interviewer_turn" && msg.result?.text) {
        setSpeaking(true);
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "interviewer", text: msg.result.text },
        ]);
        window.setTimeout(() => setSpeaking(false), 800);
        if (msg.result.kind === "wrap_up") setPhase("done");
      }
    };
    return () => ws.close();
  }, [phase, campaignId]);

  // --- Voice-mode WS (new: /ws/voice/{campaignId}) ---
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
        const recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ev.data.arrayBuffer().then((buf) => ws.send(buf));
          }
        };
        recorder.start(250); // 250 ms opus chunks
      } catch (err) {
        console.error("mic permission denied", err);
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
        case "interviewer_turn":
          if (msg.text) {
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "interviewer", text: msg.text! },
            ]);
            if (msg.kind === "wrap_up") setPhase("done");
          }
          break;
        case "stt_delta":
          if (msg.is_final && msg.text) {
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "respondent", text: msg.text! },
            ]);
          }
          break;
        case "tts_start":
          setSpeaking(true);
          break;
        case "tts_end":
          setSpeaking(false);
          break;
        case "error":
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
    // Text composer only makes sense in text mode; voice mode ignores it.
    if (mode === "text") {
      wsRef.current?.send(JSON.stringify({ type: "reply", text }));
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
  if (phase === "done") return <Thanks />;

  if (mode === "voice") {
    return (
      <div className="min-h-screen flex flex-col">
        <ProgressDots current={Math.min(messages.length / 2, 5)} total={5} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <VoiceOrb speaking={speaking} />
          <p className="text-body max-w-md text-center text-lg">
            {messages[messages.length - 1]?.text ?? "Let's begin. Take a breath."}
          </p>
          {!connected && <p className="text-sm text-muted">connecting…</p>}
        </div>
        <div className="p-4 border-t border-hairline">
          <ChatComposer
            onSend={sendReply}
            placeholder="Type your reply, or hold space to talk…"
            disabled={!connected}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ProgressDots current={Math.min(messages.length / 2, 5)} total={5} />
      <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full px-6">
        <ChatFeed messages={messages} />
      </div>
      <div className="w-full max-w-2xl mx-auto">
        <ChatComposer onSend={sendReply} disabled={!connected} />
      </div>
    </div>
  );
}

function Consent({ onStart }: { onStart: (mode: "text" | "voice") => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="overline mb-4">a conversation, not a survey</p>
        <h1 className="font-display text-5xl mb-6 leading-tight">
          Thanks for being here.
        </h1>
        <p className="text-body text-lg leading-relaxed">
          A researcher would like to hear from you. It'll take about 15 minutes
          and your responses shape what gets built next. Choose how you'd like to
          talk:
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => onStart("text")}
            className="h-12 px-6 rounded-btn bg-ink text-paper hover:bg-ink-soft"
          >
            Start with text
          </button>
          <button
            onClick={() => onStart("voice")}
            className="h-12 px-6 rounded-btn border border-hairline text-ink hover:bg-paper-elevated"
          >
            Use voice →
          </button>
        </div>
        <p className="text-xs text-muted mt-6 max-w-sm mx-auto">
          By continuing you consent to your responses being recorded and analyzed
          to improve the product.
        </p>
      </div>
    </div>
  );
}

function Thanks() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="overline mb-4">that's a wrap</p>
        <h1 className="font-display text-5xl mb-6 leading-tight">Thank you.</h1>
        <p className="text-body text-lg leading-relaxed">
          You've helped shape what gets built. The team will read every word.
        </p>
      </div>
    </div>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            i < current ? "bg-ink" : "bg-hairline"
          }`}
        />
      ))}
    </div>
  );
}
