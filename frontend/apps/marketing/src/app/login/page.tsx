"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Input, Label } from "@telepace/ui";
import { env, routes, validateLogin } from "@telepace/config";
import { Nav, Footer } from "@/components/site-chrome";
import { login } from "@/lib/auth-fetch";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors([]);
    const clientErrs = validateLogin({ email, password }).map((v) => v.message);
    if (clientErrs.length > 0) {
      setErrors(clientErrs);
      return;
    }
    setSubmitting(true);
    try {
      const tokens = await login({ email, password });
      // Hand off tokens to the app via URL fragment (not query) so browser
      // history / server logs don't leak them.
      const target = new URL(env.appUrl);
      target.hash =
        `access_token=${encodeURIComponent(tokens.access_token)}` +
        `&refresh_token=${encodeURIComponent(tokens.refresh_token)}` +
        `&expires_in=${tokens.expires_in}`;
      window.location.href = target.toString();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Login failed"]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Nav />
      <section className="min-h-[calc(100vh-4rem-24rem)] flex items-center py-20">
        <div className="container-content grid md:grid-cols-12 items-center gap-10">
          <div className="md:col-span-6">
            <p className="overline mb-4">Welcome back</p>
            <h1 className="font-display text-[clamp(2.5rem,4.5vw,3.75rem)] leading-tight">
              Sign in to <span className="italic text-accent">telepace.</span>
            </h1>
            <p className="mt-6 text-body text-lg max-w-md">
              Studies you&apos;ve drafted, interviews mid-flight, insights waiting — all right where you left them.
            </p>
          </div>

          <div className="md:col-span-6">
            <div className="rounded-card border border-hairline bg-paper-elevated p-8 max-w-md md:ml-auto">
              <form className="space-y-4" onSubmit={onSubmit} noValidate>
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
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="password">Password</Label>
                    <Link href={routes.forgot} className="text-xs text-accent">
                      Forgot?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {errors.length > 0 && (
                  <ul className="text-sm text-red-600 space-y-1">
                    {errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}
                <Button className="w-full h-11" type="submit" disabled={submitting}>
                  {submitting ? "Signing in..." : "Log in"}
                </Button>
              </form>

              <p className="mt-6 text-sm text-muted text-center">
                Don&apos;t have an account?{" "}
                <Link href={routes.signup} className="text-accent">
                  Sign up →
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
