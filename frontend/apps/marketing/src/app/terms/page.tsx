import Link from "next/link";
import { siteConfig } from "@telepace/config";
import { Nav, Footer, PageHeader } from "@/components/site-chrome";

export const metadata = { title: "Terms · telepace" };

const sections = [
  {
    id: "acceptance",
    title: "1. Acceptance",
    body: "By creating a telepace account or using the service, you agree to these Terms. If you're using it on behalf of a company, you represent you have authority to bind that company.",
  },
  {
    id: "service",
    title: "2. The service",
    body: "Telepace provides software to design, run, and analyze user-research interviews. We may change features to improve the product; we won't remove features that materially affect paid tiers without 30 days' notice.",
  },
  {
    id: "your-content",
    title: "3. Your content",
    body: "You retain all rights to studies you design and transcripts you collect. You grant us a limited license to process this content solely to provide the service. We do not use your content to train models.",
  },
  {
    id: "acceptable-use",
    title: "4. Acceptable use",
    body: "You may not use telepace to solicit interviews under false pretense, conduct research on minors without appropriate consent, or run studies in violation of applicable law. We reserve the right to suspend accounts violating these rules.",
  },
  {
    id: "payment",
    title: "5. Payment",
    body: "Paid plans bill monthly or annually in advance. Refunds are prorated to the day if you cancel. Overage charges (voice minutes, completions above tier) bill in arrears within seven days of the billing cycle close.",
  },
  {
    id: "termination",
    title: "6. Termination",
    body: "Either party may terminate for any reason with 30 days' notice. On termination, you get 30 days to export your data; after that, we delete it permanently.",
  },
  {
    id: "warranty",
    title: "7. Warranties & disclaimers",
    body: "The service is provided on an 'as is' basis. We warrant we'll use commercially reasonable efforts to keep the service available. We disclaim all other warranties, express or implied, to the maximum extent permitted by law.",
  },
  {
    id: "liability",
    title: "8. Limitation of liability",
    body: "To the maximum extent permitted by law, our aggregate liability arising from these Terms is limited to the amount you paid us in the 12 months preceding the claim. We are not liable for indirect, incidental, or consequential damages.",
  },
  {
    id: "governing-law",
    title: "9. Governing law",
    body: "These Terms are governed by the laws of Delaware, USA. Disputes are resolved in the state and federal courts of Delaware, waiving jury trial where permitted.",
  },
  {
    id: "changes",
    title: "10. Changes",
    body: "We may update these Terms; material changes trigger email notice 30 days in advance. Continued use after the effective date constitutes acceptance.",
  },
];

export default function TermsPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="Terms of Service"
        title={<>Terms in plain English.</>}
        lede="Boring is a feature. Effective 2026-05-05."
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
          <div className="md:col-span-9 space-y-12">
            {sections.map((s) => (
              <div key={s.id} id={s.id}>
                <h2 className="font-display text-2xl mb-3">{s.title}</h2>
                <p className="text-body">{s.body}</p>
              </div>
            ))}
            <div className="border-t border-hairline pt-8 text-sm text-muted">
              Legal questions? Email <Link href={`mailto:${siteConfig.contact.legalEmail}`} className="text-accent underline">{siteConfig.contact.legalEmail}</Link>.
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
