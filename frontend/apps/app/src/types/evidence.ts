export type InterviewStatus = "invited" | "in_progress" | "completed" | "abandoned";
export type TurnRole = "interviewer" | "respondent" | "system";
export type InsightKind = "theme" | "verbatim" | "persona" | "metric" | "concern";
export type RespondentSource = "csv" | "crm" | "link" | "api";
export type ChannelKind = "web_text" | "web_voice" | "phone_outbound" | "phone_inbound" | "email" | "sms";

export type Turn = {
  id: string;
  interview_id: string;
  order: number;
  role: TurnRole;
  text: string;
  audio_url?: string;
  started_at: string;
  latency_ms?: number;
  outline_item_id?: string;
};

export type Interview = {
  id: string;
  campaign_id: string;
  respondent_id: string;
  channel: ChannelKind;
  status: InterviewStatus;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  goal_coverage: number;
  turns: Turn[];
};

export type SegmentBucket = {
  label: string;
  count: number;
  percentage: number;
};

export type CrossTabRow = {
  metric: string;
  values: number[];
  counts: number[];
};

export type ResponseRow = {
  respondent_id: string;
  external_ref?: string;
  source: RespondentSource;
  channel: ChannelKind;
  duration_seconds?: number;
  quality_score?: number;
  segments: Record<string, string>;
  bullet_summary: string;
  exclusion_reason?: string;
  completed_at?: string;
};
