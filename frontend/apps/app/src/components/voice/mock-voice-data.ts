// Mock data for voice analysis components.
// In production, this would come from the backend voice pipeline API.

export type TranscriptTurn = {
  id: string;
  role: "interviewer" | "respondent";
  text: string;
  start_time: number;
  end_time: number;
};

export type VoiceMetricsData = {
  avg_sentiment: number;
  pace_wpm: number;
  pause_count: number;
  longest_pause_ms: number;
  emotion_distribution: { label: string; value: number }[];
};

export type MockVoiceData = {
  turns: TranscriptTurn[];
  metrics: VoiceMetricsData;
  audioSrc: string;
};

const MOCK_TURNS: TranscriptTurn[] = [
  {
    id: "t-001",
    role: "interviewer",
    text: "Thanks for joining today. Could you start by telling me about your role and what you're working on this quarter?",
    start_time: 0,
    end_time: 8.5,
  },
  {
    id: "t-002",
    role: "respondent",
    text: "Sure! I'm a product manager at a mid-size SaaS company. This quarter we're focused on reducing churn in our pro tier, which has been a real challenge for us.",
    start_time: 9.2,
    end_time: 19.8,
  },
  {
    id: "t-003",
    role: "interviewer",
    text: "Walk me through the last time you needed to evaluate a subscription tier change for your team.",
    start_time: 21.0,
    end_time: 27.5,
  },
  {
    id: "t-004",
    role: "respondent",
    text: "Last month, actually. We were looking at upgrading from the starter plan to pro. The $79 per seat price really gave us pause though. It's a big jump from $29, especially when you're scaling a team of fifteen.",
    start_time: 28.3,
    end_time: 42.1,
  },
  {
    id: "t-005",
    role: "interviewer",
    text: "What specifically about the $79 tier made you hesitate?",
    start_time: 43.5,
    end_time: 48.0,
  },
  {
    id: "t-006",
    role: "respondent",
    text: "Honestly, it was the lack of SSO. At our size, SSO is a compliance requirement. Paying $79 per seat and still not getting SSO felt wrong. We ended up staying on starter and just dealing with the limitations.",
    start_time: 49.0,
    end_time: 64.2,
  },
  {
    id: "t-007",
    role: "interviewer",
    text: "If SSO were included in the pro tier, would that change your willingness to upgrade?",
    start_time: 65.8,
    end_time: 71.5,
  },
  {
    id: "t-008",
    role: "respondent",
    text: "Absolutely. That would be the tipping point for us. We actually budgeted for it assuming SSO was included. The procurement team had already approved the spend. It was embarrassing to walk it back when we realized it wasn't there.",
    start_time: 72.5,
    end_time: 88.0,
  },
];

const MOCK_METRICS: VoiceMetricsData = {
  avg_sentiment: 0.35,
  pace_wpm: 142,
  pause_count: 14,
  longest_pause_ms: 3200,
  emotion_distribution: [
    { label: "Neutral", value: 0.42 },
    { label: "Frustrated", value: 0.24 },
    { label: "Engaged", value: 0.18 },
    { label: "Confident", value: 0.1 },
    { label: "Hesitant", value: 0.06 },
  ],
};

export function getMockVoiceData(_interviewId: string): MockVoiceData {
  return {
    turns: MOCK_TURNS,
    metrics: MOCK_METRICS,
    // Empty string: player renders but cannot play without a real audio source
    audioSrc: "",
  };
}

export type AudioClip = {
  id: string;
  // Theme label surfaced by the highlight-extraction pipeline.
  theme: string;
  // Clip length in seconds.
  duration: number;
  // Transcript excerpt shown as an overlay on the clip player.
  transcript: string;
  audioSrc: string;
};

const MOCK_CLIPS: AudioClip[] = [
  {
    id: "clip-001",
    theme: "Pricing objection",
    duration: 14,
    transcript:
      "The $79 per seat price really gave us pause. It's a big jump from $29, especially when you're scaling a team of fifteen.",
    audioSrc: "",
  },
  {
    id: "clip-002",
    theme: "SSO as a blocker",
    duration: 15,
    transcript:
      "It was the lack of SSO. At our size, SSO is a compliance requirement. Paying $79 per seat and still not getting SSO felt wrong.",
    audioSrc: "",
  },
  {
    id: "clip-003",
    theme: "Willingness to upgrade",
    duration: 16,
    transcript:
      "Absolutely. That would be the tipping point for us. We actually budgeted for it assuming SSO was included.",
    audioSrc: "",
  },
  {
    id: "clip-004",
    theme: "Churn context",
    duration: 11,
    transcript:
      "This quarter we're focused on reducing churn in our pro tier, which has been a real challenge for us.",
    audioSrc: "",
  },
  {
    id: "clip-005",
    theme: "Procurement friction",
    duration: 13,
    transcript:
      "The procurement team had already approved the spend. It was embarrassing to walk it back when we realized it wasn't there.",
    audioSrc: "",
  },
];

export function getMockClips(_studyId: string): AudioClip[] {
  return MOCK_CLIPS;
}
