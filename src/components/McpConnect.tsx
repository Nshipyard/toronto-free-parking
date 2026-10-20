"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/i18n";
import { OpenAILogo, AnthropicLogo, TerminalIcon, DotsIcon } from "./HarnessLogos";

export type McpConfig = {
  slug: string;
  displayName: string;
  exampleEn: string;
  exampleFr: string;
};

type TabId = "chatgpt" | "claude" | "claudecode" | "cli" | "other";

const TABS: { id: TabId; logo: React.ReactNode }[] = [
  { id: "chatgpt", logo: <OpenAILogo /> },
  { id: "claude", logo: <AnthropicLogo /> },
  { id: "claudecode", logo: <AnthropicLogo /> },
  { id: "cli", logo: <TerminalIcon /> },
  { id: "other", logo: <DotsIcon /> },
];

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export default function McpConnect({ config }: { config: McpConfig }) {
  const { t, lang } = useLang();
  const m = t.mcp;
  const [tab, setTab] = useState<TabId>("claudecode");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const example = lang === "fr" ? config.exampleFr : config.exampleEn;

  function fill(template: string) {
    return template
      .replaceAll("{displayName}", config.displayName)
      .replaceAll("{slug}", config.slug)
      .replaceAll("{origin}", origin || "https://this-site.example")
      .replaceAll("{example}", example)
      .replaceAll("{exampleLower}", lowerFirst(example));
  }

  const prompts: Record<Exclude<TabId, "other">, string> = {
    chatgpt: fill(m.pChatgpt),
    claude: fill(m.pClaude),
    claudecode: fill(m.pClaudeCode),
    cli: fill(m.pCli),
  };

  const tabLabel = (id: TabId) => m.tabs[id];
  const activePrompt = tab === "other" ? "" : prompts[tab];

  async function copy() {
    const text = tab === "other" ? `${origin}/mcp` : activePrompt;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-14">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/60">{m.kicker}</p>
      <h3 className="display mt-3 max-w-[640px] text-[30px] md:text-[36px]">{m.title}</h3>
      <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-white/70">{m.body}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map(({ id, logo }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-colors ${
              tab === id ? "bg-white text-ink" : "bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
            }`}
          >
            {logo}
            {tabLabel(id)}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-[24px] bg-white/[0.06]">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
          <h4 className="text-[17px] font-semibold">
            {tab === "other" ? m.otherTitle : m.cardTitle.replace("{tab}", tabLabel(tab))}
          </h4>
          <button
            onClick={copy}
            className="shrink-0 rounded-full bg-canada px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90"
          >
            {copied ? m.copied : m.copy}
          </button>
        </div>
        {tab === "other" ? (
          <div className="space-y-3 px-6 py-5 text-[15px]">
            <p className="text-white/60">{m.otherBody}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-white/60">{m.mcpEndpoint}:</span>
              <code className="font-mono text-[13px] text-white/85 break-all">{origin}/mcp</code>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-white/60">{m.openapiSpec}:</span>
              <a href="/api/openapi.json" className="font-mono text-[13px] text-white/85 underline underline-offset-2 break-all">
                {origin}/api/openapi.json
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-white/60">{m.restBase}:</span>
              <code className="font-mono text-[13px] text-white/85 break-all">{origin}/api/v1</code>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5">
            {tab === "chatgpt" && <p className="mb-3 text-[14px] text-white/60">{m.chatgptNote}</p>}
            <pre className="whitespace-pre-wrap font-mono text-[13.5px] leading-relaxed text-white/85">{activePrompt}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
