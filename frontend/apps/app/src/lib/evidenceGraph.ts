import type {
  CampaignEvidence,
  EvidenceInterviewDoc,
  InsightItem,
} from "./api";
import type {
  ChannelKind,
  Citation,
  EvidenceGraph,
  Insight,
  InsightKind,
  Interview,
  Respondent,
  RespondentSource,
  ResponseRow,
  Theme,
  Turn,
} from "../types/evidence";

const CHANNELS = new Set<ChannelKind>([
  "web_text",
  "web_voice",
  "phone_outbound",
  "phone_inbound",
  "email",
  "sms",
]);

function channel(value: string): ChannelKind {
  return CHANNELS.has(value as ChannelKind) ? (value as ChannelKind) : "web_text";
}

function insightKind(value: string): InsightKind {
  return ["theme", "verbatim", "persona", "metric", "concern"].includes(value)
    ? (value as InsightKind)
    : "theme";
}

function bodyString(body: Record<string, unknown>): string {
  for (const key of ["description", "summary", "body", "quote", "label"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function optionalString(
  body: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function supportingInterviewIds(item: InsightItem): string[] {
  return [
    ...stringArray(item.body.support_interview_ids),
    ...stringArray(item.body.supporting_interview_ids),
  ].filter((value, index, all) => all.indexOf(value) === index);
}

function transcriptTurn(
  interview: EvidenceInterviewDoc | undefined,
  quote: string,
) {
  if (!interview) return undefined;
  const respondentTurns = interview.turns.filter((turn) => turn.role === "respondent");
  return respondentTurns.find(
    (turn) => turn.text === quote || turn.text.includes(quote) || quote.includes(turn.text),
  );
}

type CitationMeta = {
  citation: Citation;
  themeLabel: string;
  interviewId: string;
  insightId: string;
};

function buildCitationMeta(
  doc: CampaignEvidence,
  interviewsById: Map<string, EvidenceInterviewDoc>,
): CitationMeta[] {
  const rows: CitationMeta[] = [];
  for (const item of doc.insights) {
    if (item.kind !== "verbatim") continue;
    const quote =
      typeof item.body.quote === "string" && item.body.quote.trim()
        ? item.body.quote.trim()
        : item.title;
    const interviewId =
      typeof item.body.interview_id === "string" ? item.body.interview_id : "";
    const interview = interviewsById.get(interviewId);
    const turn = transcriptTurn(interview, quote);
    if (!interview || !turn || !quote) continue;
    rows.push({
      citation: {
        id: `citation-${item.id}`,
        interview_id: interviewId,
        turn_id: turn.id,
        respondent_id: interview.respondent_id,
        quote_text: quote,
      },
      themeLabel:
        typeof item.body.theme_label === "string" ? item.body.theme_label.trim() : "",
      interviewId,
      insightId: item.id,
    });
  }
  return rows;
}

function buildInsight(
  studyId: string,
  item: InsightItem,
  citationMeta: CitationMeta[],
): Insight {
  const kind = insightKind(item.kind);
  const related = citationMeta
    .filter(
      (meta) =>
        meta.insightId === item.id ||
        (meta.themeLabel.length > 0 && meta.themeLabel === item.title),
    )
    .map((meta) => meta.citation);
  return {
    id: item.id,
    study_id: studyId,
    kind,
    title: item.title,
    body: bodyString(item.body) || item.title,
    recommendation: optionalString(item.body, [
      "recommendation",
      "recommended_action",
      "action",
    ]),
    confidence: item.confidence,
    supporting_evidence: related,
    claims: [
      {
        id: `claim-${item.id}`,
        study_id: studyId,
        text: bodyString(item.body) || item.title,
        kind,
        confidence: item.confidence,
        evidence_ids: related.map((citation) => citation.id),
      },
    ],
  };
}

function buildRespondent(studyId: string, row: EvidenceInterviewDoc): Respondent {
  const turns: Turn[] = row.turns.map((turn) => ({
    id: turn.id,
    interview_id: row.interview_id,
    order: turn.order,
    role: turn.role,
    text: turn.text,
    started_at: turn.started_at,
    latency_ms: turn.latency_ms ?? undefined,
  }));
  const interview: Interview = {
    id: row.interview_id,
    campaign_id: studyId,
    respondent_id: row.respondent_id,
    channel: channel(row.channel),
    status: row.status,
    started_at: row.started_at ?? undefined,
    completed_at: row.completed_at ?? undefined,
    duration_seconds: row.duration_seconds ?? undefined,
    goal_coverage: row.goal_coverage,
    turns,
  };
  return {
    id: row.respondent_id,
    study_id: studyId,
    external_ref: row.external_ref ?? undefined,
    source: row.source as RespondentSource,
    channel: channel(row.channel),
    segments: {},
    interviews: [interview],
  };
}

/** Convert the authenticated REST read model into the report's evidence graph.
 *
 * Every citation is linked to a respondent turn from this same campaign.
 * Missing evidence remains missing; this function never manufactures sample
 * themes, participants, counts, or quotes.
 */
export function buildEvidenceGraph(doc: CampaignEvidence): EvidenceGraph {
  const interviewsById = new Map(
    doc.interviews.map((interview) => [interview.interview_id, interview]),
  );
  const citationMeta = buildCitationMeta(doc, interviewsById);
  const graphInsights = doc.insights.map((item) =>
    buildInsight(doc.campaign_id, item, citationMeta),
  );
  const graphById = new Map(graphInsights.map((insight) => [insight.id, insight]));
  const themes: Theme[] = [];

  for (const item of doc.insights.filter((insight) => insight.kind === "theme")) {
    const primary = graphById.get(item.id);
    if (!primary) continue;
    // Verbatims are already represented by the theme's citation markers and
    // appendix. Rendering them as normal insights repeats the quote as both
    // its title and body, producing a noisy duplicate paragraph.
    const items = [primary];
    themes.push({
      id: `theme-${item.id}`,
      study_id: doc.campaign_id,
      label: item.title,
      insights: items,
      support_count: Math.max(
        supportingInterviewIds(item).length,
        new Set(items.flatMap((insight) => insight.supporting_evidence.map((c) => c.interview_id)))
          .size,
      ),
    });
  }

  return {
    study_id: doc.campaign_id,
    campaign_title: doc.campaign_title,
    research_goal: doc.research_goal,
    generated_at: doc.generated_at,
    themes,
    respondents: doc.interviews.map((row) => buildRespondent(doc.campaign_id, row)),
    citations: citationMeta.map((meta) => meta.citation),
    insights: graphInsights,
  };
}

/** Build the researcher response table from real interview events.
 *
 * The summary is intentionally extractive: it clips the first two respondent
 * answers instead of asking another model to invent a participant summary.
 */
export function buildResponseRows(doc: CampaignEvidence | null): ResponseRow[] {
  if (!doc) return [];
  return doc.interviews.map((row) => {
    const answers = row.turns
      .filter((turn) => turn.role === "respondent" && turn.text.trim())
      .map((turn) => turn.text.trim());
    return {
      respondent_id: row.respondent_id,
      external_ref: row.external_ref ?? undefined,
      source: row.source as RespondentSource,
      channel: channel(row.channel),
      duration_seconds: row.duration_seconds ?? undefined,
      goal_coverage: row.status === "completed" ? row.goal_coverage : undefined,
      segments: {},
      bullet_summary: answers
        .slice(0, 2)
        .map((answer) => (answer.length > 100 ? `${answer.slice(0, 99).trimEnd()}…` : answer))
        .join(" · "),
      completed_at: row.completed_at ?? undefined,
    };
  });
}
