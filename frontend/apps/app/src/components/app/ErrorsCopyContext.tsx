"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ErrorsCopyTable } from "@/lib/errors";

const Ctx = createContext<ErrorsCopyTable>({});

export function ErrorsCopyProvider({
  copy,
  children,
}: {
  copy: ErrorsCopyTable;
  children: ReactNode;
}) {
  return <Ctx.Provider value={copy}>{children}</Ctx.Provider>;
}

export function useErrorsCopy(): ErrorsCopyTable {
  return useContext(Ctx);
}
