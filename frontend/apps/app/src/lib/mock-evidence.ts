/**
 * Mock evidence-graph factory.
 *
 * Generates a deterministic, realistic EvidenceGraph for development and
 * testing.  All IDs follow the pattern `{entity}-{NNN}` so they are stable
 * across renders and snapshots.
 */

import type {
  Citation,
  Claim,
  ChannelKind,
  EvidenceGraph,
  Insight,
  Interview,
  Respondent,
  RespondentSource,
  Theme,
  Turn,
} from "@/types/evidence";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(3, "0");
}

function turnId(interview: number, turn: number): string {
  return `turn-${pad(interview)}-${pad(turn)}`;
}

// ---------------------------------------------------------------------------
// Citation factory (12 citations)
// ---------------------------------------------------------------------------

function buildCitations(_studyId: string): Citation[] {
  const data: Array<{
    interviewIdx: number;
    turnIdx: number;
    respondentIdx: number;
    quote: string;
  }> = [
    { interviewIdx: 1, turnIdx: 2, respondentIdx: 1, quote: "I tried three other tools before this and none of them handled follow-up questions well." },
    { interviewIdx: 1, turnIdx: 4, respondentIdx: 1, quote: "Pricing was never the issue -- it was always about time to first insight." },
    { interviewIdx: 2, turnIdx: 2, respondentIdx: 2, quote: "The onboarding wizard walked me through everything in under five minutes." },
    { interviewIdx: 2, turnIdx: 4, respondentIdx: 2, quote: "I would pay double if it meant I didn't have to manually tag transcripts." },
    { interviewIdx: 3, turnIdx: 2, respondentIdx: 3, quote: "Our team switched from spreadsheets to your platform and saw results in days, not weeks." },
    { interviewIdx: 3, turnIdx: 4, respondentIdx: 3, quote: "The biggest friction point is sharing reports with stakeholders who aren't on the platform." },
    { interviewIdx: 4, turnIdx: 2, respondentIdx: 4, quote: "Voice interviews feel more natural to respondents than typed surveys." },
    { interviewIdx: 5, turnIdx: 2, respondentIdx: 5, quote: "I need better filtering when looking at themes across 50+ interviews." },
    { interviewIdx: 5, turnIdx: 4, respondentIdx: 5, quote: "The AI follow-ups sometimes repeat what was already asked, which is awkward." },
    { interviewIdx: 6, turnIdx: 2, respondentIdx: 6, quote: "We ran a pricing study and the confidence scores helped us prioritize which quotes to present to leadership." },
    { interviewIdx: 7, turnIdx: 2, respondentIdx: 7, quote: "Setup was easy but I wish there was a template library for common research goals." },
    { interviewIdx: 8, turnIdx: 2, respondentIdx: 8, quote: "Being able to segment by role and seniority level was a game-changer for our persona work." },
  ];

  return data.map((d, i) => ({
    id: `cit-${pad(i + 1)}`,
    interview_id: `int-${pad(d.interviewIdx)}`,
    turn_id: turnId(d.interviewIdx, d.turnIdx),
    respondent_id: `resp-${pad(d.respondentIdx)}`,
    quote_text: d.quote,
  }));
}

// ---------------------------------------------------------------------------
// Claim factory
// ---------------------------------------------------------------------------

function buildClaims(studyId: string): Claim[] {
  return [
    { id: "clm-001", study_id: studyId, text: "Users value speed to first insight over price.", kind: "theme", confidence: 0.91, evidence_ids: ["cit-001", "cit-002"] },
    { id: "clm-002", study_id: studyId, text: "Onboarding is rated positively when completed in under 5 minutes.", kind: "metric", confidence: 0.88, evidence_ids: ["cit-003"] },
    { id: "clm-003", study_id: studyId, text: "Manual transcript tagging is a key pain point.", kind: "concern", confidence: 0.85, evidence_ids: ["cit-004"] },
    { id: "clm-004", study_id: studyId, text: "Teams transitioning from spreadsheets see faster time to value.", kind: "verbatim", confidence: 0.82, evidence_ids: ["cit-005"] },
    { id: "clm-005", study_id: studyId, text: "Report sharing with external stakeholders is a friction point.", kind: "concern", confidence: 0.79, evidence_ids: ["cit-006"] },
    { id: "clm-006", study_id: studyId, text: "Voice interviews produce more natural respondent behavior.", kind: "theme", confidence: 0.87, evidence_ids: ["cit-007"] },
    { id: "clm-007", study_id: studyId, text: "Filtering and search across large studies needs improvement.", kind: "concern", confidence: 0.76, evidence_ids: ["cit-008"] },
    { id: "clm-008", study_id: studyId, text: "AI follow-up questions occasionally repeat prior topics.", kind: "concern", confidence: 0.72, evidence_ids: ["cit-009"] },
    { id: "clm-009", study_id: studyId, text: "Confidence scores help users prioritize findings for leadership.", kind: "metric", confidence: 0.84, evidence_ids: ["cit-010"] },
    { id: "clm-010", study_id: studyId, text: "Demographic segmentation enables effective persona development.", kind: "persona", confidence: 0.90, evidence_ids: ["cit-012"] },
  ];
}

// ---------------------------------------------------------------------------
// Insight factory (5 insights)
// ---------------------------------------------------------------------------

function buildInsights(
  studyId: string,
  claims: Claim[],
  citations: Citation[],
): Insight[] {
  return [
    {
      id: "ins-001",
      study_id: studyId,
      kind: "theme",
      title: "Speed to insight matters more than price",
      body: "Across interviews, respondents consistently emphasized that reducing time from data collection to actionable insight is more valuable than a lower price point. Users who previously used manual methods reported frustration with turnaround time.",
      claims: [claims[0], claims[3]],
      confidence: 0.89,
      supporting_evidence: [citations[0], citations[1], citations[4]],
    },
    {
      id: "ins-002",
      study_id: studyId,
      kind: "metric",
      title: "Onboarding completes in under 5 minutes",
      body: "Users who completed onboarding rated the experience highly, with most finishing the guided wizard in under five minutes. This correlates strongly with 30-day retention.",
      claims: [claims[1]],
      confidence: 0.88,
      supporting_evidence: [citations[2]],
    },
    {
      id: "ins-003",
      study_id: studyId,
      kind: "concern",
      title: "Stakeholder sharing and report export need work",
      body: "Multiple respondents cited difficulty sharing findings with team members or leadership who are not platform users. External report links and PDF export were the most requested features.",
      claims: [claims[4], claims[2]],
      confidence: 0.81,
      supporting_evidence: [citations[3], citations[5]],
    },
    {
      id: "ins-004",
      study_id: studyId,
      kind: "theme",
      title: "Voice-native interviews feel more natural",
      body: "Respondents and researchers both noted that voice-based interviews elicit richer, more candid responses compared to typed chat or traditional surveys.",
      claims: [claims[5]],
      confidence: 0.87,
      supporting_evidence: [citations[6]],
    },
    {
      id: "ins-005",
      study_id: studyId,
      kind: "persona",
      title: "Segmentation enables effective persona development",
      body: "Research teams that used demographic segmentation (role, seniority, industry) were able to build more actionable personas. Confidence scores helped prioritize which verbatims to surface in presentations.",
      claims: [claims[9], claims[8]],
      confidence: 0.86,
      supporting_evidence: [citations[9], citations[11]],
    },
  ];
}

// ---------------------------------------------------------------------------
// Respondent + Interview factory (8 respondents)
// ---------------------------------------------------------------------------

function buildRespondents(studyId: string): Respondent[] {
  const profiles: Array<{
    source: RespondentSource;
    channel: ChannelKind;
    segments: Record<string, string>;
    externalRef?: string;
  }> = [
    { source: "panel", channel: "web_text", segments: { role: "Product Manager", seniority: "Senior", industry: "SaaS" } },
    { source: "link", channel: "web_text", segments: { role: "UX Researcher", seniority: "Mid", industry: "FinTech" } },
    { source: "panel", channel: "web_voice", segments: { role: "Head of Research", seniority: "Director", industry: "E-commerce" } },
    { source: "link", channel: "web_voice", segments: { role: "Founder", seniority: "C-Level", industry: "HealthTech" } },
    { source: "import", channel: "web_text", segments: { role: "Data Analyst", seniority: "Junior", industry: "EdTech" }, externalRef: "ext-survey-042" },
    { source: "panel", channel: "phone_outbound", segments: { role: "Marketing Lead", seniority: "Senior", industry: "Retail" } },
    { source: "api", channel: "email", segments: { role: "Customer Success", seniority: "Mid", industry: "SaaS" } },
    { source: "link", channel: "web_text", segments: { role: "VP Product", seniority: "VP", industry: "Media" }, externalRef: "crm-lead-789" },
  ];

  return profiles.map((p, i) => {
    const idx = i + 1;
    const respId = `resp-${pad(idx)}`;
    const intId = `int-${pad(idx)}`;

    const turns: Turn[] = [
      { id: turnId(idx, 1), role: "interviewer", text: "Thanks for joining. Can you tell me about your current research workflow?", timestamp: `2025-03-${String(10 + idx).padStart(2, "0")}T10:00:00Z` },
      { id: turnId(idx, 2), role: "respondent", text: `As a ${p.segments.role}, I spend most of my time coordinating with stakeholders and synthesizing findings manually.`, timestamp: `2025-03-${String(10 + idx).padStart(2, "0")}T10:02:00Z` },
      { id: turnId(idx, 3), role: "interviewer", text: "What's the biggest pain point in that process?", timestamp: `2025-03-${String(10 + idx).padStart(2, "0")}T10:03:00Z` },
      { id: turnId(idx, 4), role: "respondent", text: "Honestly, the time it takes to go from raw interviews to a shareable report. It's weeks, not days.", timestamp: `2025-03-${String(10 + idx).padStart(2, "0")}T10:05:00Z` },
    ];

    const interview: Interview = {
      id: intId,
      campaign_id: `camp-${studyId}`,
      respondent_id: respId,
      channel: p.channel,
      turns,
      started_at: turns[0].timestamp,
      ended_at: turns[turns.length - 1].timestamp,
    };

    return {
      id: respId,
      study_id: studyId,
      external_ref: p.externalRef,
      source: p.source,
      channel: p.channel,
      segments: p.segments,
      interviews: [interview],
    };
  });
}

// ---------------------------------------------------------------------------
// Theme factory (3 themes)
// ---------------------------------------------------------------------------

function buildThemes(studyId: string, insights: Insight[]): Theme[] {
  return [
    {
      id: "thm-001",
      study_id: studyId,
      label: "User Satisfaction & Value Perception",
      insights: [insights[0], insights[1]],
      support_count: 5,
    },
    {
      id: "thm-002",
      study_id: studyId,
      label: "Onboarding & Adoption Friction",
      insights: [insights[2]],
      support_count: 3,
    },
    {
      id: "thm-003",
      study_id: studyId,
      label: "Channel Preferences & Persona Research",
      insights: [insights[3], insights[4]],
      support_count: 4,
    },
  ];
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build a complete, deterministic evidence graph suitable for development
 * and UI prototyping.
 *
 * Contents:
 *  - 3 themes
 *  - 8 respondents (each with 1 interview of 4 turns)
 *  - 12 citations
 *  - 5 insights (backed by 10 claims)
 */
export function buildMockEvidenceGraph(studyId: string): EvidenceGraph {
  const citations = buildCitations(studyId);
  const claims = buildClaims(studyId);
  const insights = buildInsights(studyId, claims, citations);
  const respondents = buildRespondents(studyId);
  const themes = buildThemes(studyId, insights);

  return {
    study_id: studyId,
    themes,
    respondents,
    citations,
    insights,
  };
}
