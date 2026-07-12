/**
 * Evidence Graph data model.
 *
 * Core types for the insight / evidence layer that connects raw interview
 * turns to themed, citation-backed claims.  Consumed by the analysis UI
 * (T-102 through T-107).
 */

// ---------------------------------------------------------------------------
// Enums / union literals
// ---------------------------------------------------------------------------

/** Kind of insight produced by the analysis pipeline. */
export type InsightKind =
  | "theme"
  | "verbatim"
  | "persona"
  | "metric"
  | "concern";

/** How the respondent was recruited. */
export type RespondentSource =
  | "csv"
  | "crm"
  | "panel"
  | "link"
  | "import"
  | "api";

/** Communication channel used for the interview. */
export type ChannelKind =
  | "web_text"
  | "web_voice"
  | "phone_outbound"
  | "phone_inbound"
  | "email"
  | "sms";

export type InterviewStatus = "invited" | "in_progress" | "completed" | "abandoned";
export type TurnRole = "interviewer" | "respondent" | "system";

// ---------------------------------------------------------------------------
// Core interview primitives
// ---------------------------------------------------------------------------

/** A single conversational turn inside an interview. */
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
  /** Alias used by mock data factories. */
  timestamp?: string;
};

/** A completed (or in-progress) interview session. */
export type Interview = {
  id: string;
  campaign_id: string;
  respondent_id: string;
  channel: ChannelKind;
  status: InterviewStatus;
  started_at?: string;
  completed_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  goal_coverage: number;
  turns: Turn[];
};

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

/** A bucket used for segmented cross-tab views. */
export type SegmentBucket = {
  label: string;
  count: number;
  percentage: number;
};

/** A row inside a cross-tabulation table. */
export type CrossTabRow = {
  metric: string;
  values: number[];
  counts: number[];
};

/** Per-respondent row used in the response-level data table. */
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

// ---------------------------------------------------------------------------
// Evidence graph types
// ---------------------------------------------------------------------------

/** A pointer into a specific interview turn, carrying the verbatim quote. */
export type Citation = {
  id: string;
  interview_id: string;
  turn_id: string;
  respondent_id: string;
  quote_text: string;
  start_offset?: number;
  end_offset?: number;
};

/** An atomic, evidence-backed assertion extracted by the analysis agent. */
export type Claim = {
  id: string;
  study_id: string;
  text: string;
  kind: InsightKind;
  confidence: number;
  evidence_ids: string[];
};

/** A higher-level insight composed of one or more claims. */
export type Insight = {
  id: string;
  study_id: string;
  kind: InsightKind;
  title: string;
  body: string;
  claims: Claim[];
  confidence: number;
  supporting_evidence: Citation[];
};

/**
 * A thematic grouping of insights. Themes can nest via `parent_id` for
 * sub-theme hierarchies.
 */
export type Theme = {
  id: string;
  study_id: string;
  label: string;
  parent_id?: string;
  insights: Insight[];
  support_count: number;
};

/** A study participant with demographic segments and linked interviews. */
export type Respondent = {
  id: string;
  study_id: string;
  external_ref?: string;
  source: RespondentSource;
  channel: ChannelKind;
  segments: Record<string, string>;
  interviews: Interview[];
};

/**
 * The top-level evidence graph for a study.  Everything the analysis UI
 * needs to render themes, drill into citations, and cross-tab respondents.
 */
export type EvidenceGraph = {
  study_id: string;
  themes: Theme[];
  respondents: Respondent[];
  citations: Citation[];
  insights: Insight[];
};
