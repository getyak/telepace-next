import { Button, Input, Label } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";

const sections = [
  { id: "workspace", label: "Workspace" },
  { id: "members", label: "Members" },
  { id: "billing", label: "Billing" },
  { id: "api-keys", label: "API keys" },
  { id: "mcp", label: "MCP" },
  { id: "danger", label: "Danger zone" },
];

const members = [
  { name: "Alex Kim", email: "alex@acme.com", role: "Owner" },
  { name: "Jordan Lee", email: "jordan@acme.com", role: "Editor" },
  { name: "Priya Rao", email: "priya@acme.com", role: "Viewer" },
];

export default function SettingsPage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader eyebrow="Settings" title="Workspace preferences." />

      <div className="grid md:grid-cols-12 gap-10">
        <aside className="md:col-span-3">
          <nav className="sticky top-6 space-y-1 text-sm">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block rounded-btn px-3 py-2 text-body hover:bg-paper-elevated hover:text-ink transition-colors">
                {s.label}
              </a>
            ))}
          </nav>
        </aside>
        <div className="md:col-span-9 space-y-14">
          <section id="workspace">
            <p className="overline mb-4">Workspace</p>
            <div className="rounded-card border border-hairline bg-paper-elevated p-6 space-y-4">
              <div>
                <Label htmlFor="ws-name">Workspace name</Label>
                <Input id="ws-name" defaultValue="Acme Research" />
              </div>
              <div>
                <Label htmlFor="ws-slug">URL slug</Label>
                <Input id="ws-slug" defaultValue="acme" />
              </div>
              <div className="pt-2 flex justify-end">
                <Button>Save changes</Button>
              </div>
            </div>
          </section>

          <section id="members">
            <p className="overline mb-4">Members</p>
            <div className="border border-hairline rounded-card divide-y divide-hairline bg-paper-elevated">
              {members.map((m) => (
                <div key={m.email} className="grid grid-cols-12 items-center px-6 py-4">
                  <div className="col-span-5">
                    <p className="font-medium text-ink">{m.name}</p>
                    <p className="text-sm text-muted">{m.email}</p>
                  </div>
                  <div className="col-span-4 text-sm text-body">{m.role}</div>
                  <div className="col-span-3 text-right">
                    <Button variant="ghost" size="sm">Manage</Button>
                  </div>
                </div>
              ))}
              <div className="px-6 py-4 flex justify-end">
                <Button variant="secondary" size="sm">+ Invite member</Button>
              </div>
            </div>
          </section>

          <section id="billing">
            <p className="overline mb-4">Billing</p>
            <div className="rounded-card border border-hairline bg-paper-elevated p-6">
              <div className="flex items-baseline justify-between mb-6">
                <div>
                  <p className="font-display text-2xl">Pro</p>
                  <p className="text-sm text-muted">Renews on 2026-07-15 · $79 / mo</p>
                </div>
                <Button variant="secondary" size="sm">Manage plan</Button>
              </div>
              <div className="grid grid-cols-3 border-t border-hairline pt-4">
                <div><p className="overline mb-1">Studies used</p><p className="font-display text-2xl">14</p></div>
                <div><p className="overline mb-1">Completions</p><p className="font-display text-2xl">312 / 500</p></div>
                <div><p className="overline mb-1">Voice minutes</p><p className="font-display text-2xl">48 min</p></div>
              </div>
            </div>
          </section>

          <section id="api-keys">
            <p className="overline mb-4">API keys</p>
            <div className="rounded-card border border-hairline bg-paper-elevated p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-ink">tp_live_a1b2•••7f9</p>
                  <p className="text-xs text-muted">created 2026-06-04 · last used 2026-07-02</p>
                </div>
                <Button variant="ghost" size="sm">Rotate</Button>
              </div>
              <div className="pt-2 flex justify-end">
                <Button variant="secondary" size="sm">+ Create key</Button>
              </div>
            </div>
          </section>

          <section id="mcp">
            <p className="overline mb-4">MCP server</p>
            <div className="rounded-card border border-hairline bg-paper-elevated p-6">
              <p className="text-body mb-3">Your workspace's MCP endpoint:</p>
              <pre className="font-mono text-sm rounded-btn bg-paper-sunken p-3 text-ink">https://mcp.telepace.io/w/acme</pre>
              <p className="text-xs text-muted mt-3">Authenticate with your API key above. Compatible with Claude Desktop, Claude Code, Cursor, and Codex.</p>
            </div>
          </section>

          <section id="danger">
            <p className="overline mb-4 text-terracotta">Danger zone</p>
            <div className="rounded-card border border-terracotta/30 bg-terracotta/5 p-6 flex items-center justify-between">
              <div>
                <p className="font-display text-lg">Delete workspace</p>
                <p className="text-sm text-body">All studies, transcripts, and insights will be permanently deleted after a 30-day grace period.</p>
              </div>
              <Button variant="secondary" className="border-terracotta text-terracotta hover:bg-terracotta hover:text-paper">Delete workspace</Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
