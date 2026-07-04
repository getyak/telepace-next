import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { routes, siteConfig } from "@telepace/config";

import { AuthCard } from "../_components/AuthCard";
import { LoginForm } from "../_components/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${siteConfig.brand.name}.`,
};

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back."
      footer={
        <>
          New to {siteConfig.brand.name}?{" "}
          <Link href={routes.signup} className="text-ink hover:underline">
            Create an account
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
