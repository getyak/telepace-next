import Link from "next/link";
import { Button } from "@telepace/ui";
import { routes } from "@telepace/config";

const studies = [
  { id: "01", title: "Pricing sensitivity for pro tier", status: "live", completed: 32, target: 50 },
  { id: "02", title: "Why did people churn last quarter?", status: "draft", completed: 0, target: 20 },
  { id: "03", title: "New onboarding walkthrough — first reactions", status: "closed", completed: 24, target: 24 },
];

export default function StudiesPage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      <header className="flex items-end justify-between mb-10">
        <div>
          <p className="overline mb-2">Your studies</p>
          <h1 className="font-display text-4xl">What are we learning today?</h1>
        </div>
        <Link href={routes.app.studies.new}>
          <Button size="lg">+ New study</Button>
        </Link>
      </header>

      <div className="border border-hairline rounded-card divide-y divide-hairline bg-paper-elevated">
        {studies.map((s) => (
          <Link
            key={s.id}
            href={routes.app.studies.byId(s.id)}
            className="grid grid-cols-12 items-center px-6 py-5 hover:bg-paper transition-colors"
          >
            <div className="col-span-1 text-muted font-mono text-sm">{s.id}</div>
            <div className="col-span-6 font-display text-lg">{s.title}</div>
            <div className="col-span-2">
              <StatusPill status={s.status} />
            </div>
            <div className="col-span-2 text-sm text-body">
              {s.completed} / {s.target} completed
            </div>
            <div className="col-span-1 text-right text-muted">→</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    live: "bg-accent-soft text-accent border-accent/20",
    draft: "bg-paper-sunken text-muted border-hairline",
    closed: "bg-paper text-body border-hairline",
  };
  return (
    <span
      className={`inline-block px-3 py-1 rounded-pill border text-xs ${
        styles[status] ?? styles.draft
      }`}
    >
      {status}
    </span>
  );
}
