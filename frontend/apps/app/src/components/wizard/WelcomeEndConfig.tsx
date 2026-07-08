"use client";

import { useTranslations } from "next-intl";
import { Input, Label, Textarea } from "@telepace/ui";

// Only the study-level fields this component reads/writes.
// The parent passes the full Spec; this interface is kept narrow
// so the component stays decoupled from outline/channel details.
interface StudySettings {
  welcome_message?: string;
  consent_text?: string;
  end_message?: string;
  reward_description?: string;
  redirect_url?: string;
}

interface WelcomeEndConfigProps {
  spec: StudySettings;
  onChange: (updated: Partial<StudySettings>) => void;
}

export function WelcomeEndConfig({ spec, onChange }: WelcomeEndConfigProps) {
  const t = useTranslations("app.followups");

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div>
        <Label>{t("welcomeTitle")}</Label>
        <Textarea
          value={spec.welcome_message ?? ""}
          placeholder={t("welcomePlaceholder")}
          rows={3}
          onChange={(e) => onChange({ welcome_message: e.target.value })}
        />
      </div>

      {/* Consent text */}
      <div>
        <Label>{t("consentTitle")}</Label>
        <Textarea
          value={spec.consent_text ?? ""}
          placeholder={t("consentPlaceholder")}
          rows={3}
          onChange={(e) => onChange({ consent_text: e.target.value })}
        />
      </div>

      {/* End / thank-you message */}
      <div>
        <Label>{t("endTitle")}</Label>
        <Textarea
          value={spec.end_message ?? ""}
          placeholder={t("endPlaceholder")}
          rows={3}
          onChange={(e) => onChange({ end_message: e.target.value })}
        />
      </div>

      {/* Reward description */}
      <div>
        <Label>{t("rewardTitle")}</Label>
        <Input
          value={spec.reward_description ?? ""}
          placeholder={t("rewardPlaceholder")}
          onChange={(e) => onChange({ reward_description: e.target.value })}
        />
      </div>

      {/* Completion redirect URL */}
      <div>
        <Label>{t("redirectTitle")}</Label>
        <Input
          type="url"
          value={spec.redirect_url ?? ""}
          placeholder={t("redirectPlaceholder")}
          onChange={(e) => onChange({ redirect_url: e.target.value })}
        />
      </div>
    </div>
  );
}
