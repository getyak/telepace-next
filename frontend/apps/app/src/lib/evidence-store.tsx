"use client";

/**
 * Evidence-graph React context.
 *
 * Wraps children with a provider that loads campaign-scoped evidence data and
 * exposes it via the `useEvidence()` hook.
 *
 * Design tokens referenced in sibling components:
 *   paper   #F8F6F1
 *   accent  #4A5D3B (sage)
 *   terra   #B45A3C (terracotta)
 */

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { EvidenceGraph } from "@/types/evidence";
import { getCampaignEvidence } from "@/lib/api";
import { buildEvidenceGraph } from "@/lib/evidenceGraph";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type EvidenceContextValue = {
  graph: EvidenceGraph | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
};

const EvidenceContext = createContext<EvidenceContextValue | undefined>(
  undefined,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EvidenceProvider({
  children,
  studyId,
}: {
  children: ReactNode;
  studyId: string;
}) {
  const [graph, setGraph] = useState<EvidenceGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCampaignEvidence(studyId)
      .then((doc) => {
        if (!cancelled) setGraph(buildEvidenceGraph(doc));
      })
      .catch((reason) => {
        if (!cancelled) {
          setGraph(null);
          setError(reason);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studyId, revision]);

  return (
    <EvidenceContext.Provider value={{ graph, loading, error, reload }}>
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
