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
            of pushing the body. `relative` gives fixed-workbench pages (the
            create studio) a positioning context so they can pin themselves to
            the viewport with `absolute inset-0` and scroll only *inside* their
            own panes — a flex/`overflow-y-auto` chain otherwise leaks a scroll
            pane's content height up to <html>, letting the whole page drag. */}
        <div className="flex h-screen flex-col overflow-hidden md:flex-row">
          <Sidebar />
          <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
          <AgentDock />
        </div>
      </ErrorsCopyProvider>
    </AuthProvider>
  );
}
