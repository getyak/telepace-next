"use client";

/**
 * Live billing panel (T-622/T-624): current plan, this period's qualified
 * interviews vs quota, voice minutes, and the upgrade / manage actions.
 *
 * Upgrade opens a Stripe Checkout session; "Manage plan" opens the Stripe
 * Customer Portal — both are full-page redirects to Stripe-hosted pages.
 * While billing is not configured server-side (503) the panel degrades to a
 * quiet "not available" note instead of an error wall.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, CardBody, CardFooter } from "@telepace/ui";

import {
  createBillingPortal,
  createCheckout,
  getBillingSummary,
  type BillingSummary,
} from "@/lib/api";

const PLAN_PRICE: Record<BillingSummary["plan"], string> = {
  free: "$0 / mo",
  pro: "$79 / mo",
  team: "$249 / mo",
};

export function BillingPanel() {
  const t = useTranslations("app.settings");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBillingSummary()
      .then((s) => {
        if (!cancelled) {
          setSummary(s);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goCheckout = useCallback(async (plan: "pro" | "team") => {
    setBusy("checkout");
    try {
      const { url } = await createCheckout(plan);
      window.location.assign(url);
    } catch {
      setBusy(null);
    }
  }, []);

  const goPortal = useCallback(async () => {
    setBusy("portal");
    try {
      const { url } = await createBillingPortal();
      window.location.assign(url);
    } catch {
      setBusy(null);
    }
  }, []);

  if (state === "loading") {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">{t("billingLoading")}</p>
        </CardBody>
      </Card>
    );
  }

  if (state === "unavailable" || summary === null) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">{t("billingUnavailable")}</p>
        </CardBody>
      </Card>
    );
  }

  const planName = t(`plans.${summary.plan}`);
  const quotaPct =
    summary.quota > 0
      ? Math.min(100, Math.round((summary.qualified_used / summary.quota) * 100))
      : 0;
  const atLimit = summary.plan === "free" && summary.qualified_used >= summary.quota;
  const voiceMinutes = Math.round(summary.voice_seconds / 60);

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="overline mb-1">{t("planLabel")}</p>
            <p className="font-display text-3xl">{planName}</p>
            <p className="mt-1 text-sm text-muted">
              {summary.current_period_end
                ? t("renewsLine", {
                    date: summary.current_period_end.slice(0, 10),
                    price: PLAN_PRICE[summary.plan],
                  })
                : PLAN_PRICE[summary.plan]}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {summary.has_subscription ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={goPortal}
                disabled={busy !== null}
              >
                {busy === "portal" ? t("billingRedirecting") : t("managePlan")}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() => goCheckout("pro")}
                  disabled={busy !== null}
                >
                  {busy === "checkout" ? t("billingRedirecting") : t("upgradePro")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => goCheckout("team")}
                  disabled={busy !== null}
                >
                  {t("upgradeTeam")}
                </Button>
              </>
            )}
          </div>
        </div>

        {atLimit ? (
          <p className="mt-4 rounded-btn bg-terracotta/10 px-3 py-2 text-sm text-ink">
            {t("quotaReached", { quota: summary.quota })}
          </p>
        ) : null}
      </CardBody>

      <CardFooter className="bg-paper-sunken/40">
        <p className="overline mb-3">{t("usageTitle")}</p>
        <div className="mb-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
            <span>{t("qualifiedInterviews")}</span>
            <span>
              {summary.qualified_used} / {summary.quota}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-hairline"
            role="progressbar"
            aria-valuenow={summary.qualified_used}
            aria-valuemin={0}
            aria-valuemax={summary.quota}
          >
            <div
              className={`h-full rounded-full ${atLimit ? "bg-terracotta" : "bg-ink"}`}
              style={{ width: `${quotaPct}%` }}
            />
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">{t("qualifiedInterviews")}</dt>
            <dd className="mt-0.5 font-display text-2xl">{summary.qualified_used}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("disqualifiedInterviews")}</dt>
            <dd className="mt-0.5 font-display text-2xl">{summary.disqualified}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t("voiceMinutes")}</dt>
            <dd className="mt-0.5 font-display text-2xl">{voiceMinutes} min</dd>
          </div>
        </dl>
      </CardFooter>
    </Card>
  );
}
