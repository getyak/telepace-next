"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Input, Label, Skeleton } from "@telepace/ui";
import { routes, siteConfig } from "@telepace/config";

import { useAuth } from "../../lib/auth/AuthProvider";
import { ApiError } from "../../lib/http";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16 bg-paper">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href={routes.home} className="font-display text-2xl">
            {siteConfig.brand.name}
          </Link>
          <p className="overline mt-4">Sign in</p>
          <h1 className="font-display text-3xl mt-2">Welcome back.</h1>
        </div>

        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-sm text-muted mt-6">
          New to {siteConfig.brand.name}?{" "}
          <Link href={routes.signup} className="text-ink hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
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
    <form onSubmit={onSubmit} className="rounded-card border border-hairline bg-paper-elevated p-6 space-y-4">
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
