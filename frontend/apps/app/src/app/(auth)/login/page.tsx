"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Input, Label, Skeleton } from "@telepace/ui";
import { routes } from "@telepace/config";

import { AuthCard } from "@/components/auth/AuthCard";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError } from "@/lib/http";

export default function LoginPage() {
  return (
    <AuthCard
      overline="Sign in"
      title="Welcome back."
      footer={
        <>
          New to telepace?{" "}
          <Link href={routes.signup} className="text-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<LoginFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(evt: React.FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      const next = params.get("next") || routes.app.root;
      router.push(next);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Email or password is incorrect."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-card border border-hairline bg-paper-elevated p-6">
      <OAuthButtons />
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href={routes.forgot} className="text-xs text-muted hover:text-ink">
              Forgot?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="rounded-card border border-hairline bg-paper-elevated p-6 space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-10 rounded-input" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 rounded-input" />
      </div>
      <Skeleton className="h-10 rounded-btn" />
    </div>
  );
}
