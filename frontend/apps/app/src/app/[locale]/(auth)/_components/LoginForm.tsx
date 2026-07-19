"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Label } from "@telepace/ui";
import { env, routes, validateLogin } from "@telepace/config";

import { login } from "@/lib/auth/client";
import {
  authErrorMessage,
  getLastLoginMethod,
  rememberLoginMethod,
  validationErrorMessage,
  type LoginMethod,
} from "./auth-helpers";
import { GoogleButton, OrDivider } from "./GoogleButton";

export function LoginForm() {
  const t = useTranslations("auth");
  const tv = useTranslations("auth.validation");
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

  // The OAuth callback bounces back here with ?error=oauth when Google sign-in
  // is declined or the exchange fails — surface it in the shared error slot.
  useEffect(() => {
    if (params.get("error") === "oauth") {
      setError(t("oauth.failed"));
    }
  }, [params, t]);

  async function onSubmit(evt: React.FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    setError(null);

    const clientErrs = validateLogin({ email, password });
    if (clientErrs.length > 0) {
      setError(validationErrorMessage(clientErrs[0], tv));
      return;
    }

    setSubmitting(true);
    try {
      await login({ email, password });
      rememberLoginMethod("password");
      const next = params.get("next") || routes.app.root;
      router.push(next);
    } catch (err) {
      setError(authErrorMessage(err, t));
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
          <Label htmlFor="email">{t("form.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("form.emailPlaceholder")}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">{t("form.password")}</Label>
            <Link
              href={routes.forgot}
              className="rounded-input text-xs text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {t("form.forgot")}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("form.passwordPlaceholder")}
          />
        </div>

        {error && (
          <p id="login-error" className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="relative">
          <Button type="submit" className="h-11 w-full" loading={submitting}>
            {submitting ? t("form.signingIn") : t("form.signIn")}
          </Button>
          {lastMethod === "password" && !submitting && (
            <span className="absolute -right-2 -top-2 rounded-pill bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
              {t("form.lastUsed")}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
