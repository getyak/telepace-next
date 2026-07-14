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
        {/* Lock the shell to the viewport and let <main> own the scroll, so the
            sticky sidebar can never be scrolled away (a page that sets its own
            h-screen used to overflow the body and drag the rail out of view).
            min-h-0 lets the flex child shrink so its overflow engages instead
            of pushing the body. */}
        <div className="flex h-screen flex-col overflow-hidden md:flex-row">
          <Sidebar />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
          <AgentDock />
        </div>
      </ErrorsCopyProvider>
    </AuthProvider>
  );
}
