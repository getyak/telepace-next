import Link from "next/link";
import { siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = { title: "Security · telepace" };

const pillars = [
  {
    k: "Data isolation",
    v: "Every customer's data lives in its own logical tenant, keyed on org_id. Row-level policies enforce isolation at the database layer, not just the app layer.",
  },
  {
    k: "Encryption",
    v: "TLS 1.3 in transit. AES-256-GCM at rest. Envelope-encrypted secrets via cloud KMS. Zero plaintext credentials on disk.",
  },
  {
    k: "PII redaction",
    v: "All transcripts pass through a Presidio + custom-pattern redactor before persistence. Names, phone numbers, SSN, CC — never stored raw.",
  },
  {
    k: "Access control",
    v: "SSO (Okta, Google Workspace, Azure AD) on Team+. Fine-grained roles: viewer, editor, admin. Every access is audit-logged.",
  },
  {
    k: "Model training",
    v: "Your data is never used to train models — ours or any vendor's. BYO LLM keys route directly, bypassing our proxy entirely.",
  },
  {
    k: "Incident response",
    v: "24/7 on-call rotation. Notification within 72 hours for any incident affecting customer data. Postmortems public by default.",
  },
];

const certifications = [
  { name: "SOC 2 Type II", status: "In audit · report expected Q4 2026" },
  { name: "GDPR", status: "DPA available on request · EU data residency on Team+" },
  { name: "HIPAA", status: "BAA available on Enterprise · roadmap Q1 2027" },
  { name: "ISO 27001", status: "Planned 2027" },
];

export default function SecurityPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Security"
        title={<>Boring — <span className="italic text-accent">on purpose.</span></>}
        lede="Security is easy to talk about and hard to deliver. Here's the truth about what we do, what we don't, and what's next."
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-2 gap-6">
          {pillars.map((p) => (
            <div key={p.k} className="rounded-card border border-hairline bg-paper-elevated p-6">
              <p className="font-display text-2xl mb-3">{p.k}</p>
              <p className="text-body">{p.v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content max-w-3xl">
          <p className="overline mb-4">Certifications & compliance</p>
          <h2 className="font-display text-3xl mb-8">Where we are — and where we're headed.</h2>
          <dl className="divide-y divide-hairline border-t border-b border-hairline">
            {certifications.map((c) => (
              <div key={c.name} className="py-5 flex justify-between gap-6">
                <dt className="font-display text-xl">{c.name}</dt>
                <dd className="text-body text-sm text-right max-w-xs">{c.status}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-content max-w-3xl space-y-6">
          <p className="overline">Responsible disclosure</p>
          <h2 className="font-display text-3xl">Found something? Tell us.</h2>
          <p className="text-body">
            Report vulnerabilities to <Link href={`mailto:${siteConfig.contact.securityEmail}`} className="text-accent underline">{siteConfig.contact.securityEmail}</Link>.
            We acknowledge within 24 hours, triage within 72, and pay bounties starting at $500 for confirmed issues (up to $10k for critical).
          </p>
          <p className="text-body">
            PGP key: <code className="font-mono text-sm text-ink">{siteConfig.contact.pgpFingerprint}</code> · fingerprint on <Link href={siteConfig.urls.pgpKeyserver} className="text-accent underline">keys.openpgp.org</Link>.
          </p>
        </div>
      </section>
      <Footer />
    </>
  );
}
