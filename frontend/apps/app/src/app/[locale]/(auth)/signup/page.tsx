import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { routes, siteConfig } from "@telepace/config";

import { AuthCard } from "../_components/AuthCard";
import { SignupForm } from "../_components/SignupForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.auth.signup" });
  return { title: t("title"), description: t("description") };
}

export default async function SignupPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard
      title={t("signup.createYourAccount")}
      footer={
        <>
          {t("signup.alreadyHaveAccount")}{" "}
          <Link href={routes.login} className="text-ink hover:underline">
            {t("signup.signIn")}
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
