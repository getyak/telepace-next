"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, Label } from "@telepace/ui";
import { env, routes, validateLogin } from "@telepace/config";

import { login } from "@/lib/auth/client";
import {
  authErrorMessage,
  getLastLoginMethod,
  rememberLoginMethod,
  type LoginMethod,
} from "./auth-helpers";
import { GoogleButton, OrDivider } from "./GoogleButton";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMethod, setLastMethod] = useState<LoginMethod | null>(null);

  // localStorage is read post-mount to keep server/client markup identical.
  useEffect(() => {
    setLastMethod(getLastLoginMethod());
  }, []);

  async function onSubmit(evt: React.FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    setError(null);

    const clientErrs = validateLogin({ email, password });
    if (clientErrs.length > 0) {
      setError(clientErrs[0].message);
      return;
    }

    setSubmitting(true);
    try {
      await login({ email, password });
      rememberLoginMethod("password");
      const next = params.get("next") || routes.app.root;
      router.push(next);
    } catch (err) {
      setError(authErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {env.oauthGoogleEnabled && (
        <>
          <GoogleButton lastUsed={lastMethod === "google"} />
          <OrDivider />
        </>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
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
            <Link
              href={routes.forgot}
              className="text-xs text-muted transition-colors hover:text-ink"
            >
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

        <div className="relative">
          <Button type="submit" className="h-11 w-full" loading={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          {lastMethod === "password" && !submitting && (
            <span className="absolute -right-2 -top-2 rounded-pill bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
              Last used
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
