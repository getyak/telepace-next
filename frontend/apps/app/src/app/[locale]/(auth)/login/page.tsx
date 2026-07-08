import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { routes, siteConfig } from "@telepace/config";

import { AuthCard } from "../_components/AuthCard";
import { LoginForm } from "../_components/LoginForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.auth.login" });
  return { title: t("title"), description: t("description") };
}

export default async function LoginPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard
      title={t("login.welcomeBack")}
      footer={
        <>
          {t("login.newHere", { brand: siteConfig.brand.name })}{" "}
          <Link href={routes.signup} className="text-ink hover:underline">
            {t("login.createAccount")}
          </Link>
        </>
      }
    >
      {/* useSearchParams (for ?next=) requires a Suspense boundary. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
