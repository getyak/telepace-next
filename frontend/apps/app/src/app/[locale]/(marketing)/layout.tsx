import { cookies } from "next/headers";

import { Nav, Footer } from "@/components/marketing/site-chrome";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

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
    <AuthProvider redirectOnExpiry={false}>
      <Nav hasSession={hasSession} />
      <main>{children}</main>
      <Footer />
    </AuthProvider>
  );
}
