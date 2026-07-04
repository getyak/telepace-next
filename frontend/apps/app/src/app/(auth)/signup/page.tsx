"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label } from "@telepace/ui";
import { routes, validateRegister } from "@telepace/config";

import { AuthCard } from "@/components/auth/AuthCard";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function SignupPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(evt: React.FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    setError(null);
    const [firstError] = validateRegister({
      email,
      password,
      display_name: name,
    });
    if (firstError) {
      setError(firstError.message);
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, name || undefined);
      router.push(routes.app.root);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      overline="Start free"
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
      <div className="rounded-card border border-hairline bg-paper-elevated p-6">
      <OAuthButtons />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
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
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? "Creating…" : "Create workspace →"}
        </Button>

        <p className="text-xs text-muted text-center">
          By continuing you agree to the{" "}
          <Link href={routes.terms} className="text-accent">
            Terms
          </Link>{" "}
          and{" "}
          <Link href={routes.privacy} className="text-accent">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
      </div>
    </AuthCard>
  );
}
