import Link from "next/link";
import { Button } from "@telepace/ui";
import { PageHeader } from "@/components/app/PageHeader";
import { CodeBlock } from "@/components/integrations/CodeBlock";

export const metadata = {
  title: "MCP Research Tools",
  description:
    "Connect telepace to Claude Desktop, Claude Code, or Cursor via the Model Context Protocol.",
};

/* ------------------------------------------------------------------ */
/*  Connection config snippets                                        */
/* ------------------------------------------------------------------ */

const claudeDesktopConfig = `{
  "mcpServers": {
    "telepace": {
      "command": "npx",
      "args": [
        "-y",
        "@telepace/mcp-server"
      ],
      "env": {
        "TELEPACE_API_KEY": "tp_live_your_key_here"
      }
    }
  }
}`;

const claudeCodeConfig = `claude mcp add telepace \\
  --command "npx -y @telepace/mcp-server" \\
  --env TELEPACE_API_KEY=tp_live_your_key_here`;

const cursorConfig = `{
  "mcpServers": {
    "telepace": {
      "command": "npx",
      "args": ["-y", "@telepace/mcp-server"],
      "env": {
        "TELEPACE_API_KEY": "tp_live_your_key_here"
      }
    }
  }
}`;

/* ------------------------------------------------------------------ */
/*  Tool reference data                                               */
/* ------------------------------------------------------------------ */

const tools = [
  {
    name: "create_study",
    description:
      "Create a new research study with AI-generated interview questions.",
    parameters: [
      { name: "title", type: "string", required: true, note: "Study title" },
      { name: "goal", type: "string", required: true, note: "Research goal" },
      {
        name: "target_persona",
        type: "string",
        required: false,
        note: "Who to interview",
      },
    ],
    example: `{
  "title": "Pro-tier churn study",
  "goal": "Understand why users downgrade from Pro",
  "target_persona": "Pro users who cancelled in the last 90 days"
}`,
  },
  {
    name: "list_studies",
    description: "List all studies in the workspace.",
    parameters: [
      {
        name: "status",
        type: '"draft" | "live" | "closed"',
        required: false,
        note: "Filter by status",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        note: "Max results to return",
      },
    ],
    example: `{
  "status": "live",
  "limit": 10
}`,
  },
  {
    name: "query_insights",
    description: "Query insights and themes across studies.",
    parameters: [
      {
        name: "study_id",
        type: "string",
        required: false,
        note: "Scope to a specific study",
      },
      {
        name: "kind",
        type: '"theme" | "verbatim" | "persona" | "metric" | "concern"',
        required: false,
        note: "Insight type filter",
      },
      {
        name: "min_confidence",
        type: "number",
        required: false,
        note: "Minimum confidence score (0-1)",
      },
    ],
    example: `{
  "study_id": "std_4f2b9c1",
  "kind": "theme",
  "min_confidence": 0.7
}`,
  },
  {
    name: "export_evidence",
    description: "Export evidence clips with citations.",
    parameters: [
      {
        name: "study_id",
        type: "string",
        required: true,
        note: "Study to export from",
      },
      {
        name: "format",
        type: '"json" | "csv" | "markdown"',
        required: false,
        note: "Output format (default: json)",
      },
    ],
    example: `{
  "study_id": "std_4f2b9c1",
  "format": "markdown"
}`,
  },
  {
    name: "trigger_analysis",
    description: "Trigger the analysis pipeline for a study.",
    parameters: [
      {
        name: "study_id",
        type: "string",
        required: true,
        note: "Study to analyze",
      },
      {
        name: "force",
        type: "boolean",
        required: false,
        note: "Re-run even if already analyzed",
      },
    ],
    example: `{
  "study_id": "std_4f2b9c1",
  "force": true
}`,
  },
];

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function McpToolsPage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      {/* Back link */}
      <Link
        href="/integrations"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors mb-6"
      >
        <span aria-hidden="true">&larr;</span>
        Back to integrations
      </Link>

      <PageHeader
        eyebrow="MCP Integration"
        title="MCP Research Tools"
        action={
          <Link href="/settings#api-keys">
            <Button variant="secondary" size="sm">
              Manage API keys
            </Button>
          </Link>
        }
      />

      {/* Description */}
      <p className="text-body max-w-2xl mb-12">
        The telepace MCP server exposes five research tools that any
        MCP-compatible AI host can call. Connect Claude Desktop, Claude Code,
        Cursor, or any other MCP client to run studies, query insights, and
        export evidence -- all from your AI workflow.
      </p>

      {/* ------------------------------------------------------------ */}
      {/*  Connection Setup                                             */}
      {/* ------------------------------------------------------------ */}
      <section className="mb-14">
        <p className="overline mb-4">Connection setup</p>
        <h2 className="font-display text-3xl mb-6">
          Wire telepace into your AI tool.
        </h2>
        <p className="text-body mb-8 max-w-2xl">
          Copy the config snippet for your tool. Replace{" "}
          <code className="font-mono text-sm bg-paper-sunken px-1.5 py-0.5 rounded-btn">
            tp_live_your_key_here
          </code>{" "}
          with your API key from{" "}
          <Link href="/settings#api-keys" className="text-accent hover:underline">
            Settings &rarr; API keys
          </Link>
          .
        </p>

        <div className="space-y-6">
          <div>
            <h3 className="font-medium text-ink mb-3">Claude Desktop</h3>
            <p className="text-sm text-muted mb-3">
              Add to your{" "}
              <code className="font-mono text-xs bg-paper-sunken px-1.5 py-0.5 rounded-btn">
                claude_desktop_config.json
              </code>
              :
            </p>
            <CodeBlock
              code={claudeDesktopConfig}
              language="json"
              title="claude_desktop_config.json"
            />
          </div>

          <div>
            <h3 className="font-medium text-ink mb-3">Claude Code</h3>
            <p className="text-sm text-muted mb-3">
              Run this in your terminal:
            </p>
            <CodeBlock
              code={claudeCodeConfig}
              language="bash"
              title="Terminal"
            />
          </div>

          <div>
            <h3 className="font-medium text-ink mb-3">Cursor</h3>
            <p className="text-sm text-muted mb-3">
              Add to your{" "}
              <code className="font-mono text-xs bg-paper-sunken px-1.5 py-0.5 rounded-btn">
                .cursor/mcp.json
              </code>
              :
            </p>
            <CodeBlock
              code={cursorConfig}
              language="json"
              title=".cursor/mcp.json"
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/*  Tool Reference                                               */}
      {/* ------------------------------------------------------------ */}
      <section className="mb-14">
        <p className="overline mb-4">Tool reference</p>
        <h2 className="font-display text-3xl mb-6">
          Five tools. Full research lifecycle.
        </h2>
        <p className="text-body mb-8 max-w-2xl">
          Each tool is callable via the Model Context Protocol. Parameters
          marked with <span className="text-ink font-medium">*</span> are
          required.
        </p>

        <div className="space-y-6">
          {tools.map((tool) => (
            <div
              key={tool.name}
              id={`tool-${tool.name}`}
              className="rounded-card border border-hairline bg-paper-elevated p-6"
            >
              {/* Tool header */}
              <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-3">
                <code className="font-mono text-lg text-ink">
                  {tool.name}
                </code>
                <span className="text-xs text-muted">MCP tool</span>
              </div>

              <p className="text-body mb-5">{tool.description}</p>

              {/* Parameters table */}
              <div className="mb-5">
                <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                  Parameters
                </p>
                <div className="border border-hairline rounded-btn overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-paper-sunken text-left">
                          <th className="px-4 py-2 font-medium text-muted">
                            Name
                          </th>
                          <th className="px-4 py-2 font-medium text-muted">
                            Type
                          </th>
                          <th className="px-4 py-2 font-medium text-muted">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {tool.parameters.map((param) => (
                          <tr key={param.name}>
                            <td className="px-4 py-2 font-mono text-xs text-ink whitespace-nowrap">
                              {param.name}
                              {param.required && (
                                <span className="text-accent ml-0.5">*</span>
                              )}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-muted whitespace-nowrap">
                              {param.type}
                            </td>
                            <td className="px-4 py-2 text-body">
                              {param.note}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Example */}
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                  Example
                </p>
                <CodeBlock code={tool.example} language="json" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/*  Authentication                                               */}
      {/* ------------------------------------------------------------ */}
      <section className="mb-14">
        <p className="overline mb-4">Authentication</p>
        <h2 className="font-display text-3xl mb-6">API key authentication.</h2>
        <div className="rounded-card border border-hairline bg-paper-elevated p-6 space-y-4">
          <p className="text-body">
            All MCP tool calls are authenticated with your workspace API key.
            The key is passed as the{" "}
            <code className="font-mono text-sm bg-paper-sunken px-1.5 py-0.5 rounded-btn">
              TELEPACE_API_KEY
            </code>{" "}
            environment variable in your MCP server configuration.
          </p>
          <div className="border-t border-hairline pt-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                1
              </span>
              <p className="text-body">
                Go to{" "}
                <Link
                  href="/settings#api-keys"
                  className="text-accent hover:underline"
                >
                  Settings &rarr; API keys
                </Link>{" "}
                to create or rotate a key.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                2
              </span>
              <p className="text-body">
                Replace{" "}
                <code className="font-mono text-sm bg-paper-sunken px-1.5 py-0.5 rounded-btn">
                  tp_live_your_key_here
                </code>{" "}
                in the config snippets above with your actual key.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                3
              </span>
              <p className="text-body">
                Keep your key secret. Never commit it to version control. Use
                environment variables or a secrets manager in CI/CD.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/*  MCP endpoint reference                                       */}
      {/* ------------------------------------------------------------ */}
      <section>
        <p className="overline mb-4">Endpoint</p>
        <div className="rounded-card border border-hairline bg-paper-elevated p-6">
          <p className="text-body mb-3">Your workspace MCP endpoint:</p>
          <pre className="font-mono text-sm rounded-btn bg-paper-sunken p-3 text-ink">
            https://mcp.telepace.io/w/acme
          </pre>
          <p className="text-xs text-muted mt-3">
            Compatible with Claude Desktop, Claude Code, Cursor, and any
            MCP-compatible host. Authenticate with your API key.
          </p>
        </div>
      </section>
    </div>
  );
}
