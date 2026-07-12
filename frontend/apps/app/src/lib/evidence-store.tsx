"use client";

/**
 * Evidence-graph React context.
 *
 * Wraps children with a provider that loads (currently mock) evidence data
 * and exposes it via the `useEvidence()` hook.
 *
 * Design tokens referenced in sibling components:
 *   paper   #F8F6F1
 *   accent  #4A5D3B (sage)
 *   terra   #B45A3C (terracotta)
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { EvidenceGraph } from "@/types/evidence";
import { buildMockEvidenceGraph } from "@/lib/mock-evidence";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type EvidenceContextValue = {
  graph: EvidenceGraph | null;
  loading: boolean;
};

const EvidenceContext = createContext<EvidenceContextValue | undefined>(
  undefined,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const DEFAULT_STUDY_ID = "study-001";
const SIMULATED_DELAY_MS = 200;

export function EvidenceProvider({
  children,
  studyId = DEFAULT_STUDY_ID,
}: {
  children: ReactNode;
  studyId?: string;
}) {
  const [graph, setGraph] = useState<EvidenceGraph | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      if (!cancelled) {
        setGraph(buildMockEvidenceGraph(studyId));
        setLoading(false);
      }
    }, SIMULATED_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [studyId]);

  return (
    <EvidenceContext.Provider value={{ graph, loading }}>
      {children}
    </EvidenceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEvidence(): EvidenceContextValue {
  const ctx = useContext(EvidenceContext);
  if (ctx === undefined) {
    throw new Error("useEvidence must be used within an <EvidenceProvider>");
  }
  return ctx;
}
