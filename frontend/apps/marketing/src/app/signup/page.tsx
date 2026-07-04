"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Input, Label } from "@telepace/ui";
import { env, routes, validateRegister } from "@telepace/config";
import { Nav, Footer } from "@/components/site-chrome";
import { registerUser } from "@/lib/auth-fetch";

const benefits = [
  "3 studies / month, on us",
  "10 completions per study",
  "Text + shareable link channels",
  "No card required — ever",
];

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors([]);
    const clientErrs = validateRegister({
      email,
      password,
      display_name: name,
    }).map((v) => v.message);
    if (clientErrs.length > 0) {
      setErrors(clientErrs);
      return;
    }
    setSubmitting(true);
    try {
      const tokens = await registerUser({
        email,
        password,
        display_name: name || undefined,
      });
      const target = new URL(env.appUrl);
      target.hash =
        `access_token=${encodeURIComponent(tokens.access_token)}` +
        `&refresh_token=${encodeURIComponent(tokens.refresh_token)}` +
        `&expires_in=${tokens.expires_in}`;
      window.location.href = target.toString();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Sign up failed"]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Nav />
      <section className="min-h-[calc(100vh-4rem-24rem)] py-16 md:py-20">
        <div className="container-content grid md:grid-cols-12 gap-12">
          <div className="md:col-span-6 flex flex-col justify-center">
            <p className="overline mb-4">Start free</p>
            <h1 className="font-display text-[clamp(2.5rem,4.5vw,3.75rem)] leading-tight">
              Your first three interviews <span className="italic text-accent">are on us.</span>
            </h1>
            <p className="mt-6 text-body text-lg max-w-md">
              No card, no drip campaign, no sales call. Just the fastest way from a question to a hundred honest answers.
            </p>
            <ul className="mt-8 space-y-3 max-w-md">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-body">
                  <span className="text-accent mt-0.5">✓</span> {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-6">
            <div className="rounded-card border border-hairline bg-paper-elevated p-8 max-w-md md:ml-auto">
              <p className="overline mb-4">Create your workspace</p>

              <form className="space-y-4" onSubmit={onSubmit} noValidate>
                <div>
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">Choose a password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {errors.length > 0 && (
                  <ul className="text-sm text-danger space-y-1" role="alert">
                    {errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}
                <Button className="w-full h-11" type="submit" loading={submitting}>
                  Create workspace →
                </Button>
              </form>

              <p className="mt-6 text-xs text-muted text-center">
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
              <p className="mt-4 text-sm text-muted text-center">
                Already have an account?{" "}
                <Link href={routes.login} className="text-accent">
                  Sign in →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
