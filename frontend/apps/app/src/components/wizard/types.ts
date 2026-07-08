export type OutlineItem = {
  order: number;
  question: string;
  goal: string;
  max_followups?: number;
  branch_if_positive?: string | null;
  branch_if_negative?: string | null;
};

export type WizardSettings = {
  welcome_message?: string;
  consent_text?: string;
  end_message?: string;
  reward_description?: string;
  redirect_url?: string;
};

export type WizardForm = {
  goal: string;
  target_persona: string;
  audience_screener: string[];
  outline: OutlineItem[];
  channels: string[];
  target_completions: number;
  settings: WizardSettings;
};

export const WIZARD_STEPS = [
  "goal",
  "audience",
  "questions",
  "settings",
  "review",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];
