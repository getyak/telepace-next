import { cookies } from "next/headers";

import { Nav, Footer } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/seo/JsonLd";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { organizationSchema, webSiteSchema } from "@/lib/seo";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The session cookie is httpOnly and scoped to path "/", so the server can
  // detect logged-in-ness and hand it to the nav as a first-paint hint.
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(ACCESS_COOKIE);

  return (
    <AuthProvider redirectOnExpiry={false} initialHasSession={hasSession}>
      {/* Scroll-reveal blocks start at opacity:0 and only fade in once JS
          (IntersectionObserver) marks them visible. Without JS — a crawler that
          doesn't execute scripts, or a reader who disabled them — that content
          would stay invisible. This <noscript> forces every .tp-reveal fully
          visible when JS never runs, so the landing content is always painted.
          The reduced-motion path is handled separately in globals.css. */}
      <noscript>
        <style>{".tp-reveal{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      {/* Site-wide identity graph — rendered once for every marketing route so
          Organization/WebSite are always discoverable regardless of entry page. */}
      <JsonLd data={[organizationSchema(), webSiteSchema()]} />
      <Nav hasSession={hasSession} />
      <main>{children}</main>
      <Footer />
    </AuthProvider>
  );
}
