import { cookies } from "next/headers";
import { routes } from "@telepace/config";

import { redirect } from "@/i18n/navigation";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Already signed in? The auth pages have nothing to offer — send them into
  // the app. The session cookie is httpOnly at path "/", so we can decide this
  // on the server with no flash of the login/signup form.
  const { locale } = await params;
  const cookieStore = await cookies();
  if (cookieStore.has(ACCESS_COOKIE)) {
    redirect({ href: routes.app.root, locale });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-paper px-6 py-16">
      {/* A whisper of depth — nothing louder (no grids, no light blobs). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(90% 55% at 50% 0%, #EFEBE2 0%, transparent 70%)",
        }}
      />
      <div className="relative w-full max-w-[400px]">{children}</div>
    </div>
  );
}
