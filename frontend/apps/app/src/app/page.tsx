import Link from "next/link";
import { Button, Badge, EmptyState, icons } from "@telepace/ui";
import { routes } from "@telepace/config";
import { PageHeader } from "../components/app/PageHeader";

const studies = [
  { id: "01", title: "Pricing sensitivity for pro tier", status: "live", completed: 32, target: 50 },
  { id: "02", title: "Why did people churn last quarter?", status: "draft", completed: 0, target: 20 },
  { id: "03", title: "New onboarding walkthrough — first reactions", status: "closed", completed: 24, target: 24 },
];

export default function StudiesPage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow="Your studies"
        title="What are we learning today?"
        action={
          <Link href={routes.app.studies.new}>
            <Button size="lg">+ New study</Button>
          </Link>
        }
      />

      {studies.length === 0 ? (
        <EmptyState
          icon={<icons.StudiesIcon size={28} />}
          title="No studies yet."
          description="Describe what you want to learn — the Designer agent drafts the interview for you."
          action={
            <Link href={routes.app.studies.new}>
              <Button>New study</Button>
            </Link>
          }
        />
      ) : (
        <div className="border border-hairline rounded-card divide-y divide-hairline bg-paper-elevated">
          {studies.map((s) => (
            <Link
              key={s.id}
              href={routes.app.studies.byId(s.id)}
              className="grid grid-cols-2 md:grid-cols-12 items-center gap-y-2 px-6 py-5 hover:bg-paper transition-colors"
            >
              <div className="hidden md:block md:col-span-1 text-muted font-mono text-sm">{s.id}</div>
              <div className="col-span-2 md:col-span-6 font-display text-lg">{s.title}</div>
              <div className="md:col-span-2">
                <StatusBadge status={s.status} />
              </div>
              <div className="md:col-span-2 text-sm text-body">
                {s.completed} / {s.target} completed
              </div>
              <div className="hidden md:block md:col-span-1 text-right text-muted">→</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "live" ? "accent" : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}
