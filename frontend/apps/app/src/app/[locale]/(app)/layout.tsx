import { getMessages } from "next-intl/server";

import { AuthProvider } from "@/lib/auth/AuthProvider";
import { Sidebar } from "@/components/app/Sidebar";
import { AgentDock } from "@/components/agent/AgentDock";
import { ErrorsCopyProvider } from "@/components/app/ErrorsCopyContext";
import type { ErrorsCopyTable } from "@/lib/errors";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  const errorsCopy = (messages.errors ?? {}) as ErrorsCopyTable;

  return (
    <AuthProvider>
      <ErrorsCopyProvider copy={errorsCopy}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
          <AgentDock />
        </div>
      </ErrorsCopyProvider>
    </AuthProvider>
  );
}
