"use client";

/**
 * Tracks which citation is currently open in the transcript panel.
 *
 * Kept separate from the data-loading `EvidenceProvider` (evidence-store.tsx)
 * so open/close state can re-render only the panel, not the graph consumers.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CitationContextValue = {
  openCitationId: string | null;
  openCitation: (citationId: string) => void;
  closeCitation: () => void;
};

const CitationContext = createContext<CitationContextValue | undefined>(
  undefined,
);

export function CitationProvider({ children }: { children: ReactNode }) {
  const [openCitationId, setOpenCitationId] = useState<string | null>(null);

  const openCitation = useCallback((citationId: string) => {
    setOpenCitationId(citationId);
  }, []);

  const closeCitation = useCallback(() => {
    setOpenCitationId(null);
  }, []);

  const value = useMemo(
    () => ({ openCitationId, openCitation, closeCitation }),
    [openCitationId, openCitation, closeCitation],
  );

  return (
    <CitationContext.Provider value={value}>
      {children}
    </CitationContext.Provider>
  );
}

export function useCitationPanel(): CitationContextValue {
  const ctx = useContext(CitationContext);
  if (ctx === undefined) {
    throw new Error("useCitationPanel must be used within a <CitationProvider>");
  }
  return ctx;
}
