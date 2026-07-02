import { Button } from "@telepace/ui";

const segments = [
  { name: "Pro trial (last 30 days)", count: 1240, source: "Stripe · auto-sync", delivered: 380, opened: 220, completed: 68 },
  { name: "Churned in Q2", count: 542, source: "CSV · uploaded 2026-06-01", delivered: 120, opened: 84, completed: 34 },
  { name: "Beta researchers", count: 84, source: "Manual · vetted", delivered: 60, opened: 55, completed: 41 },
];

const uploads = [
  { name: "pro_trial_2026-06.csv", rows: 1240, date: "2026-06-30", status: "synced" },
  { name: "churned_q2.csv", rows: 542, date: "2026-06-01", status: "synced" },
];

export default function AudiencePage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      <header className="flex items-end justify-between mb-10">
        <div>
          <p className="overline mb-2">Audience</p>
          <h1 className="font-display text-4xl">Who telepace can talk to for you.</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">Import CSV</Button>
          <Button size="sm">+ New segment</Button>
        </div>
      </header>

      <section className="mb-14">
        <p className="overline mb-4">Segments</p>
        <div className="grid gap-4">
          {segments.map((s) => (
            <div key={s.name} className="rounded-card border border-hairline bg-paper-elevated p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-display text-2xl mb-1">{s.name}</p>
                  <p className="text-sm text-muted">{s.count.toLocaleString()} people · {s.source}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-xs text-muted">Delivered</p>
                    <p className="font-display text-xl">{s.delivered}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Opened</p>
                    <p className="font-display text-xl">{s.opened}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Completed</p>
                    <p className="font-display text-xl text-accent">{s.completed}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="overline mb-4">Uploads</p>
        <div className="border border-hairline rounded-card divide-y divide-hairline bg-paper-elevated">
          {uploads.map((u) => (
            <div key={u.name} className="grid grid-cols-12 items-center px-6 py-4 text-sm">
              <div className="col-span-6 font-mono text-body">{u.name}</div>
              <div className="col-span-2 text-muted">{u.rows.toLocaleString()} rows</div>
              <div className="col-span-2 text-muted font-mono">{u.date}</div>
              <div className="col-span-2 text-right">
                <span className="inline-block px-2.5 py-0.5 rounded-pill border border-accent/30 bg-accent-soft text-accent text-xs">
                  {u.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
