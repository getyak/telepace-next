import type { Citation, EvidenceGraph, Insight } from "@/types/evidence";

const insightRank: Record<Insight["kind"], number> = {
  theme: 0,
  concern: 1,
  metric: 2,
  persona: 3,
  verbatim: 4,
};

/**
 * The canonical order in which report insights appear.
 *
 * Keep this outside the React view so browser and exported reports cannot
 * silently disagree about finding order.
 */
export function getReportInsights(graph: EvidenceGraph): Insight[] {
  return graph.insights
    .filter((insight) => insight.kind !== "verbatim")
    .sort((a, b) => insightRank[a.kind] - insightRank[b.kind]);
}

/**
 * Assign citation numbers by first visible use, then append any remaining
 * graph citations in source order so the methodology count and appendix agree.
 */
export function buildReportCitationIndex(
  graph: EvidenceGraph,
): Map<string, number> {
  const index = new Map<string, number>();
  let next = 1;
  const add = (citation: Citation) => {
    if (!index.has(citation.id)) index.set(citation.id, next++);
  };

  for (const insight of getReportInsights(graph)) {
    insight.supporting_evidence.forEach(add);
  }
  for (const theme of graph.themes) {
    for (const insight of theme.insights) {
      insight.supporting_evidence.forEach(add);
    }
  }
  graph.citations.forEach(add);

  return index;
}

export function getOrderedReportCitations(
  graph: EvidenceGraph,
  citationIndex = buildReportCitationIndex(graph),
): Array<{ num: number; citation: Citation }> {
  return graph.citations
    .map((citation) => ({
      citation,
      num: citationIndex.get(citation.id),
    }))
    .filter(
      (row): row is { num: number; citation: Citation } =>
        row.num !== undefined,
    )
    .sort((a, b) => a.num - b.num);
}
