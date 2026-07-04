"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, Label } from "@telepace/ui";
import { env, routes, validateRegister } from "@telepace/config";

import { registerUser } from "@/lib/auth/client";
import {
  authErrorMessage,
  getLastLoginMethod,
  rememberLoginMethod,
  type LoginMethod,
} from "./auth-helpers";
import { GoogleButton, OrDivider } from "./GoogleButton";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMethod, setLastMethod] = useState<LoginMethod | null>(null);

  useEffect(() => {
    setLastMethod(getLastLoginMethod());
  }, []);

  async function onSubmit(evt: React.FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    setError(null);

    const clientErrs = validateRegister({ email, password, display_name: name });
    if (clientErrs.length > 0) {
      setError(clientErrs[0].message);
      return;
    }

    setSubmitting(true);
    try {
      await registerUser({ email, password, display_name: name || undefined });
      rememberLoginMethod("password");
      router.push(routes.app.root);
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
          <Label htmlFor="name">Name (optional)</Label>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8+ characters"
          />
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full" loading={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-center text-xs text-muted">
          By continuing you agree to the{" "}
          <Link href={routes.terms} className="text-ink hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href={routes.privacy} className="text-ink hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
