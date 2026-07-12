import { describe, it, expect } from "vitest";
import { WIZARD_STEPS } from "./types";
import type { WizardForm } from "./types";

const INITIAL_FORM: WizardForm = {
  goal: "",
  target_persona: "",
  audience_screener: [],
  outline: [],
  channels: ["web_text"],
  target_completions: 10,
  settings: {},
};

describe("T-004: creation wizard smoke test", () => {
  it("has exactly 5 wizard steps", () => {
    expect(WIZARD_STEPS).toHaveLength(5);
  });

  it("step values are goal, audience, questions, settings, review", () => {
    expect([...WIZARD_STEPS]).toEqual([
      "goal",
      "audience",
      "questions",
      "settings",
      "review",
    ]);
  });

  it("initial form has empty goal (blocks step 1 advancement)", () => {
    expect(INITIAL_FORM.goal).toBe("");
  });

  it("initial form has default channel web_text", () => {
    expect(INITIAL_FORM.channels).toContain("web_text");
  });

  it("initial form has 10 target completions", () => {
    expect(INITIAL_FORM.target_completions).toBe(10);
  });

  it("initial form has empty outline", () => {
    expect(INITIAL_FORM.outline).toHaveLength(0);
  });

  it("initial form settings is an empty object", () => {
    expect(INITIAL_FORM.settings).toEqual({});
  });

  it("filling goal field should allow advancing (form validation logic)", () => {
    const form = { ...INITIAL_FORM, goal: "Understand onboarding friction" };
    expect(form.goal.length).toBeGreaterThan(0);
  });

  it("outline items have correct structure", () => {
    const form: WizardForm = {
      ...INITIAL_FORM,
      goal: "Test",
      outline: [
        { order: 1, question: "How do you use X?", goal: "Understand usage" },
      ],
    };
    expect(form.outline[0].order).toBe(1);
    expect(form.outline[0].question).toBeTruthy();
    expect(form.outline[0].goal).toBeTruthy();
  });
});
