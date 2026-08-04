import { describe, expect, it } from "vitest";

import type { CampaignEvidence } from "./api";
import { buildEvidenceGraph, buildResponseRows } from "./evidenceGraph";

const doc: CampaignEvidence = {
  campaign_id: "campaign-1",
  campaign_title: "Onboarding study",
  research_goal: "Understand setup friction.",
  generated_at: "2026-08-03T01:00:00Z",
  interviews: [
    {
      interview_id: "interview-1",
      respondent_id: "respondent-1",
      source: "respondent-page",
      channel: "web_text",
      external_ref: null,
      status: "completed",
      started_at: "2026-08-03T00:00:00Z",
      completed_at: "2026-08-03T00:05:00Z",
      duration_seconds: 300,
      goal_coverage: 0.9,
      turns: [
        {
          id: "turn-1",
          order: 1,
          role: "interviewer",
          text: "What happened?",
          started_at: "2026-08-03T00:00:00Z",
          latency_ms: null,
        },
        {
          id: "turn-2",
          order: 2,
          role: "respondent",
          text: "The forced setup made me leave.",
          started_at: "2026-08-03T00:01:00Z",
          latency_ms: null,
        },
      ],
    },
  ],
  insights: [
    {
      id: "theme-1",
      kind: "theme",
      title: "Forced setup causes churn",
      confidence: 0.91,
      body: {
        description: "People want to reach value before configuration.",
        support_interview_ids: ["interview-1"],
      },
      created_at: "2026-08-03T01:00:00Z",
    },
    {
      id: "quote-1",
      kind: "verbatim",
      title: "The forced setup made me leave.",
      confidence: 0.95,
      body: {
        quote: "The forced setup made me leave.",
        interview_id: "interview-1",
        theme_label: "Forced setup causes churn",
      },
      created_at: "2026-08-03T01:00:00Z",
    },
    {
      id: "concern-1",
      kind: "concern",
      title: "Activation risk",
      confidence: 0.88,
      body: {
        description: "Setup friction can prevent activation.",
        recommendation: "Let people complete one useful task before setup.",
        support_interview_ids: ["interview-1"],
      },
      created_at: "2026-08-03T01:00:00Z",
    },
  ],
};

describe("buildEvidenceGraph", () => {
  it("builds citations only from the current campaign transcript", () => {
    const graph = buildEvidenceGraph(doc);

    expect(graph.study_id).toBe("campaign-1");
    expect(graph.respondents).toHaveLength(1);
    expect(graph.citations).toEqual([
      {
        id: "citation-quote-1",
        interview_id: "interview-1",
        turn_id: "turn-2",
        respondent_id: "respondent-1",
        quote_text: "The forced setup made me leave.",
      },
    ]);
    expect(graph.themes[0].insights.map((insight) => insight.id)).toEqual(["theme-1"]);
    expect(graph.insights.find((insight) => insight.id === "concern-1")).toMatchObject({
      recommendation: "Let people complete one useful task before setup.",
      supporting_evidence: [],
    });
  });

  it("returns an honest empty graph instead of fixture data", () => {
    const graph = buildEvidenceGraph({
      campaign_id: "empty",
      campaign_title: "Empty study",
      research_goal: "Learn honestly.",
      generated_at: null,
      insights: [],
      interviews: [],
    });

    expect(graph).toEqual({
      study_id: "empty",
      campaign_title: "Empty study",
      research_goal: "Learn honestly.",
      generated_at: null,
      themes: [],
      respondents: [],
      citations: [],
      insights: [],
    });
  });

  it("builds response rows from real respondent turns", () => {
    expect(buildResponseRows(doc)).toEqual([
      {
        respondent_id: "respondent-1",
        source: "respondent-page",
        channel: "web_text",
        duration_seconds: 300,
        goal_coverage: 0.9,
        segments: {},
        bullet_summary: "The forced setup made me leave.",
        completed_at: "2026-08-03T00:05:00Z",
      },
    ]);
  });

  it("does not attach a fabricated quote to an unrelated transcript turn", () => {
    const graph = buildEvidenceGraph({
      ...doc,
      insights: [
        doc.insights[0],
        {
          ...doc.insights[1],
          body: {
            ...doc.insights[1].body,
            quote: "A quote that was never said.",
          },
        },
      ],
    });

    expect(graph.citations).toEqual([]);
    expect(graph.themes[0].insights[0].supporting_evidence).toEqual([]);
  });

  it("clips extractive response summaries before they overwhelm the table", () => {
    const longAnswer = "A".repeat(180);
    const rows = buildResponseRows({
      ...doc,
      interviews: [
        {
          ...doc.interviews[0],
          turns: [
            {
              ...doc.interviews[0].turns[1],
              text: longAnswer,
            },
          ],
        },
      ],
    });

    expect(rows[0].bullet_summary).toHaveLength(100);
    expect(rows[0].bullet_summary.endsWith("…")).toBe(true);
  });
});
