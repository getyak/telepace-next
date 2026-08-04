import { describe, expect, it } from "vitest";

import type {
  Citation,
  EvidenceGraph,
  Insight,
  InsightKind,
} from "@/types/evidence";
import {
  buildReportCitationIndex,
  getOrderedReportCitations,
  getReportInsights,
} from "./reportModel";

function citation(id: string): Citation {
  return {
    id,
    interview_id: `interview-${id}`,
    turn_id: `turn-${id}`,
    respondent_id: `respondent-${id}`,
    quote_text: `quote ${id}`,
  };
}

function insight(
  id: string,
  kind: InsightKind,
  evidence: Citation[] = [],
): Insight {
  return {
    id,
    study_id: "study-1",
    kind,
    title: id,
    body: id,
    claims: [],
    confidence: 0.9,
    supporting_evidence: evidence,
  };
}

function graphFixture(): EvidenceGraph {
  const c1 = citation("one");
  const c2 = citation("two");
  const c3 = citation("three");
  const theme = insight("theme", "theme", [c2]);
  const concern = insight("concern", "concern", [c1]);
  return {
    study_id: "study-1",
    campaign_title: "Study",
    research_goal: "Learn",
    generated_at: null,
    themes: [
      {
        id: "theme-group",
        study_id: "study-1",
        label: "Theme",
        insights: [theme],
        support_count: 1,
      },
    ],
    respondents: [],
    citations: [c1, c2, c3],
    insights: [concern, insight("quote", "verbatim"), theme],
  };
}

describe("report model", () => {
  it("uses one stable finding order for the UI and exports", () => {
    expect(getReportInsights(graphFixture()).map((item) => item.id)).toEqual([
      "theme",
      "concern",
    ]);
  });

  it("numbers citations by first report use and retains uncited appendix evidence", () => {
    const graph = graphFixture();
    const index = buildReportCitationIndex(graph);

    expect([...index.entries()]).toEqual([
      ["two", 1],
      ["one", 2],
      ["three", 3],
    ]);
    expect(
      getOrderedReportCitations(graph, index).map(({ num, citation: item }) => [
        num,
        item.id,
      ]),
    ).toEqual([
      [1, "two"],
      [2, "one"],
      [3, "three"],
    ]);
  });
});
