"use client";

import { useTranslations } from "next-intl";
import { Button, cn } from "@telepace/ui";
import { WIZARD_STEPS } from "./types";

interface WizardShellProps {
  currentStep: number;
  onNext: () => void;
  onPrevious: () => void;
  onPublish: () => void;
  canProceed: boolean;
  publishing?: boolean;
  children: React.ReactNode;
}

const STEP_LABEL_KEYS = [
  "stepGoal",
  "stepAudience",
  "stepQuestions",
  "stepSettings",
  "stepReview",
] as const;

export function WizardShell({
  currentStep,
  onNext,
  onPrevious,
  onPublish,
  canProceed,
  publishing = false,
  children,
}: WizardShellProps) {
  const t = useTranslations("app.wizard");
  const total = WIZARD_STEPS.length;
  const isLast = currentStep === total - 1;
  const isFirst = currentStep === 0;

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Step indicator */}
      <header className="border-b border-hairline px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs text-muted mb-3">
            {t("stepIndicator", { current: currentStep + 1, total })}
          </p>
          <ol className="flex items-center gap-2">
            {STEP_LABEL_KEYS.map((key, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <li key={key} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors",
                        done && "bg-accent text-paper",
                        active && "bg-accent text-paper",
                        !done && !active && "bg-paper-elevated text-muted border border-hairline",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "text-sm truncate transition-colors",
                        active ? "text-ink font-medium" : "text-muted",
                      )}
                    >
                      {t(key)}
                    </span>
                  </div>
                  {i < total - 1 && (
                    <span
                      className={cn(
                        "h-px flex-1 transition-colors",
                        i < currentStep ? "bg-accent" : "bg-hairline",
                      )}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-2xl mx-auto">{children}</div>
      </main>

      {/* Nav */}
      <footer className="border-t border-hairline px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button variant="secondary" onClick={onPrevious} disabled={isFirst}>
            {t("previous")}
          </Button>
          {isLast ? (
            <Button onClick={onPublish} loading={publishing} disabled={!canProceed}>
              {t("publish")}
            </Button>
          ) : (
            <Button onClick={onNext} disabled={!canProceed}>
              {t("next")}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
