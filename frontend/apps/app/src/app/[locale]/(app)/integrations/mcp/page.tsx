"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";
import { CodeBlock } from "@/components/integrations/CodeBlock";

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "telepace": {
      "url": "https://mcp.telepace.io/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`;

const TOOLS = [
  { nameKey: "toolCreateStudy", descKey: "toolCreateStudyDesc" },
  { nameKey: "toolQueryInsights", descKey: "toolQueryInsightsDesc" },
  { nameKey: "toolExportEvidence", descKey: "toolExportEvidenceDesc" },
  { nameKey: "toolTriggerAnalysis", descKey: "toolTriggerAnalysisDesc" },
  { nameKey: "toolListStudies", descKey: "toolListStudiesDesc" },
] as const;

export default function McpPage() {
  const t = useTranslations("app.mcp");
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CONFIG_SNIPPET);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = CONFIG_SNIPPET;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
  }, []);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader eyebrow={t("title")} title={t("subtitle")} />

      <section className="mb-14">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl mb-1">{t("setupTitle")}</h2>
            <p className="text-sm text-body">{t("setupDescription")}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={handleCopy}>
            {copied ? t("copied") : t("copyConfig")}
          </Button>
        </div>
        <CodeBlock code={CONFIG_SNIPPET} language="json" title="mcp.json" />
      </section>

      <section>
        <h2 className="font-display text-2xl mb-4">{t("toolsTitle")}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {TOOLS.map((tool) => (
            <Card
              key={tool.nameKey}
              className="p-6"
            >
              <div className="mb-2 flex items-center gap-3">
                <Badge variant="accent">
                  <code className="font-mono text-xs">{t(tool.nameKey)}</code>
                </Badge>
              </div>
              <p className="text-sm text-body">{t(tool.descKey)}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
