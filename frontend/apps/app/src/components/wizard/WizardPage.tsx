"use client";

import { useState } from "react";
import { WizardShell } from "./WizardShell";
import { StepGoal } from "./StepGoal";
import { StepAudience } from "./StepAudience";
import { StepQuestions } from "./StepQuestions";
import { StepSettings } from "./StepSettings";
import { StepReview } from "./StepReview";
import { WIZARD_STEPS, type WizardForm, type WizardSettings } from "./types";

const INITIAL_FORM: WizardForm = {
  goal: "",
  target_persona: "",
  audience_screener: [],
  outline: [],
  channels: ["web_text"],
  target_completions: 10,
  settings: {},
};

export function WizardPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(INITIAL_FORM);
  const [publishing, setPublishing] = useState(false);

  function patch(next: Partial<WizardForm>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function patchSettings(next: Partial<WizardSettings>) {
    setForm((prev) => ({ ...prev, settings: { ...prev.settings, ...next } }));
  }

  const canProceed = (() => {
    switch (WIZARD_STEPS[step]) {
      case "goal":
        return form.goal.trim().length > 0;
      case "audience":
        return form.target_persona.trim().length > 0;
      case "questions":
        return form.outline.some((q) => q.question.trim().length > 0);
      case "settings":
        return form.channels.length > 0;
      case "review":
        return true;
      default:
        return false;
    }
  })();

  function handleNext() {
    if (!canProceed) return;
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }

  function handlePrevious() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function handlePublish() {
    setPublishing(true);
    // Wiring to the campaign API is handled by the study creation flow;
    // the wizard collects the spec and hands it off here.
    // eslint-disable-next-line no-console
    console.log("Publish study spec:", form);
    setPublishing(false);
  }

  function renderStep() {
    switch (WIZARD_STEPS[step]) {
      case "goal":
        return (
          <StepGoal goal={form.goal} onChange={(goal) => patch({ goal })} />
        );
      case "audience":
        return (
          <StepAudience
            targetPersona={form.target_persona}
            screener={form.audience_screener}
            onPersonaChange={(target_persona) => patch({ target_persona })}
            onScreenerChange={(audience_screener) => patch({ audience_screener })}
          />
        );
      case "questions":
        return (
          <StepQuestions
            outline={form.outline}
            onChange={(outline) => patch({ outline })}
          />
        );
      case "settings":
        return (
          <StepSettings
            channels={form.channels}
            targetCompletions={form.target_completions}
            settings={form.settings}
            onChannelsChange={(channels) => patch({ channels })}
            onTargetChange={(target_completions) => patch({ target_completions })}
            onSettingsChange={patchSettings}
          />
        );
      case "review":
        return <StepReview form={form} />;
      default:
        return null;
    }
  }

  return (
    <WizardShell
      currentStep={step}
      onNext={handleNext}
      onPrevious={handlePrevious}
      onPublish={handlePublish}
      canProceed={canProceed}
      publishing={publishing}
    >
      {renderStep()}
    </WizardShell>
  );
}
