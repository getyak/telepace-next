import type { Metadata } from "next";
import Link from "next/link";
import { routes, siteConfig } from "@telepace/config";

import { AuthCard } from "../_components/AuthCard";
import { SignupForm } from "../_components/SignupForm";

export const metadata: Metadata = {
  title: "Create your account",
  description: `Create a ${siteConfig.brand.name} account — free tier includes 3 studies a month, no card required.`,
};

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account."
      footer={
        <>
          Already have an account?{" "}
          <Link href={routes.login} className="text-ink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
