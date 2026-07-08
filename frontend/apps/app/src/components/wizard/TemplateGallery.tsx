"use client";

import { useTranslations } from "next-intl";
import { Button, Card, CardBody, Badge } from "@telepace/ui";
import { TEMPLATES, type Template } from "./template-data";

interface TemplateGalleryProps {
  onSelect: (template: Template) => void;
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const t = useTranslations("app.templates");

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl text-ink">{t("title")}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TEMPLATES.map((template) => (
          <Card key={template.id} className="flex flex-col">
            <CardBody className="flex flex-1 flex-col gap-3">
              <Badge variant="accent" className="self-start">
                {t(template.categoryKey)}
              </Badge>
              <h3 className="font-display text-lg text-ink">{template.title}</h3>
              <p className="flex-1 text-sm text-body">{template.description}</p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted">
                  {t("questionsCount", { count: template.questions.length })}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSelect(template)}
                >
                  {t("useTemplate")}
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
