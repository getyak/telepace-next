import Link from "next/link";
import { siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = {
  title: "Privacy",
  description: "How telepace collects, uses, and protects your data and your respondents'.",
};

const sections = [
  {
    id: "what-we-collect",
    title: "1. What we collect",
    body: [
      "Account data: your name, email, and workspace metadata.",
      "Content data: the studies you design and the interviews respondents complete.",
      "Usage data: pages visited, features used, error traces — used only to improve the product.",
      "We do not collect your respondents' names or contact info unless you upload them.",
    ],
  },
  {
    id: "how-we-use-it",
    title: "2. How we use it",
    body: [
      "To run the service you signed up for — designing studies, dispatching interviews, generating insights.",
      "To notify you about product changes and security-relevant updates.",
      "To improve the product in aggregate — never by reading individual transcripts.",
      "We do not sell your data. Ever.",
    ],
  },
  {
    id: "sharing",
    title: "3. Who we share it with",
    body: [
      "Sub-processors that make the service possible: our cloud provider, our LLM vendors (only if you use our shared keys), our voice/telephony partner.",
      "A full sub-processor list is published at telepace.io/subprocessors.",
      "We notify you 30 days before adding a new sub-processor.",
    ],
  },
  {
    id: "your-rights",
    title: "4. Your rights",
    body: [
      "You can export every event in your workspace at any time (GDPR Article 20).",
      "You can delete your workspace and have all data purged within 30 days (Article 17).",
      "You can object to specific processing (Article 21) — email privacy@telepace.io.",
      "EU residents may lodge a complaint with their local supervisory authority.",
    ],
  },
  {
    id: "retention",
    title: "5. Retention",
    body: [
      "Active workspace data is retained for as long as your account is active.",
      "After deletion, backups purge within 35 days.",
      "Anonymized aggregate telemetry may persist indefinitely.",
    ],
  },
  {
    id: "changes",
    title: "6. Changes to this policy",
    body: [
      "Material changes trigger an email 30 days before they take effect.",
      "Non-material clarifications are announced in the changelog.",
      "The current version is always at this URL.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Privacy"
        title={<>Plain-English privacy policy.</>}
        lede="Written by humans, in complete sentences, without a single dark pattern. Effective 2026-05-05."
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10">
          <aside className="md:col-span-3">
            <nav className="sticky top-24 space-y-2 text-sm">
              <p className="overline mb-3">On this page</p>
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="block text-body hover:text-ink transition-colors">
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>
          <div className="md:col-span-9 space-y-14">
            {sections.map((s) => (
              <div key={s.id} id={s.id}>
                <h2 className="font-display text-2xl mb-4">{s.title}</h2>
                <div className="space-y-3 text-body">
                  {s.body.map((p) => <p key={p}>{p}</p>)}
                </div>
              </div>
            ))}
            <div className="border-t border-hairline pt-8 text-sm text-muted">
              Questions? Email <Link href={`mailto:${siteConfig.contact.privacyEmail}`} className="text-accent underline">{siteConfig.contact.privacyEmail}</Link>.
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
