"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Label } from "@telepace/ui";
import { env, routes, storageKeys, validateRegister } from "@telepace/config";

import { registerUser } from "@/lib/auth/client";
import {
  authErrorMessage,
  getLastLoginMethod,
  rememberLoginMethod,
  validationErrorMessage,
  type LoginMethod,
} from "./auth-helpers";
import { GoogleButton, OrDivider } from "./GoogleButton";

// Plans the pricing page can hand off via ?plan=. Anything else is ignored so
// a stray/hand-typed query never renders a bogus banner.
const KNOWN_PLANS = new Set(["pro"]);

export function SignupForm() {
  const t = useTranslations("auth");
  const tv = useTranslations("auth.validation");
  const router = useRouter();
  const searchParams = useSearchParams();
  // The tier the visitor picked on /pricing ("Start Pro trial" → ?plan=pro).
  // Surfaced as a banner and carried through signup so onboarding can resume it.
  const plan = useMemo(() => {
    const raw = searchParams.get("plan");
    return raw && KNOWN_PLANS.has(raw) ? raw : null;
  }, [searchParams]);
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
      setError(validationErrorMessage(clientErrs[0], tv));
      return;
    }

    setSubmitting(true);
    try {
      await registerUser({ email, password, display_name: name || undefined });
      rememberLoginMethod("password");
      // Carry the chosen plan past registration so onboarding/billing can pick
      // it up — it was previously dropped the moment the pricing CTA landed here.
      if (plan && typeof window !== "undefined") {
        window.localStorage.setItem(storageKeys.selectedPlan, plan);
      }
      router.push(routes.app.root);
    } catch (err) {
      setError(authErrorMessage(err, t));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {plan && (
        <p
          className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-ink"
          role="status"
        >
          {t("signup.planNotice", { plan: t(`signup.plan${plan.charAt(0).toUpperCase()}${plan.slice(1)}`) })}
        </p>
      )}

      {env.oauthGoogleEnabled && (
        <>
          <GoogleButton lastUsed={lastMethod === "google"} />
          <OrDivider />
        </>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="name">{t("form.name")}</Label>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="email">{t("form.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "signup-error" : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("form.emailPlaceholder")}
          />
        </div>
        <div>
          <Label htmlFor="password">{t("form.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "signup-error" : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("form.passwordHint")}
          />
        </div>

        {error && (
          <p id="signup-error" className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full" loading={submitting}>
          {submitting ? t("form.creatingAccount") : t("form.createAccount")}
        </Button>

        <p className="text-center text-xs text-muted">
          {t("form.termsPrefix")}{" "}
          <Link href={routes.terms} className="text-ink hover:underline">
            {t("form.terms")}
          </Link>{" "}
          {t("form.termsAnd")}{" "}
          <Link href={routes.privacy} className="text-ink hover:underline">
            {t("form.privacyPolicy")}
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
