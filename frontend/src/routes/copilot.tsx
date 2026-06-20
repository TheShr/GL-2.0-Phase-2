import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { SectionHeader, Eyebrow, Beacon } from "@/components/hud";
import { useApp } from "@/lib/app-context";
import { HOTSPOTS } from "@/lib/mock";
import { useTelemetry } from "@/lib/telemetry-context";

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "Copilot — Atlas" },
      { name: "description", content: "Agentic enforcement planner: ask what-if questions and get structured deployment plans." },
    ],
  }),
  component: Copilot,
});

interface Plan {
  title: string;
  rows: { corridor: string; officers: number; window: string; delta: string }[];
  focusId?: string;
}

interface Msg {
  role: "user" | "assistant";
  text: string;
  plan?: Plan;
  focusId?: string;
}

const SUGGESTIONS = [
  "Show top 5 hotspots near Hebbal",
  "What if I only have 15 officers?",
  "Which corridor saves the most delay?",
  "Build a pre-shift plan for South ORR",
];

function answerFor(q: string): Msg {
  const ql = q.toLowerCase();
  const ranked = [...HOTSPOTS].sort((a, b) => b.riskScore - a.riskScore);

  if (ql.includes("15 officer")) {
    const top3 = ranked.slice(0, 3);
    return {
      role: "assistant",
      text: "With only 15 officers, the MILP optimizer concentrates coverage on the three highest-risk corridors. Projected city-wide delay reduction drops from 23m to 14m versus full deployment.",
      plan: {
        title: "Constrained Plan · 15 Officers",
        rows: top3.map((h) => ({ corridor: h.corridor, officers: 5, window: h.timeWindow, delta: `−${h.delayDelta}m` })),
      },
    };
  }
  if (ql.includes("hebbal")) {
    return {
      role: "assistant",
      text: "Near Hebbal, the highest-exposure corridors are along the Bellary Rd axis. Hebbal Flyover is the priority intervention.",
      focusId: "hebbal",
      plan: {
        title: "Hebbal Sector · Top Actions",
        rows: ranked.filter((h) => ["hebbal", "majestic", "marathahalli"].includes(h.id)).map((h) => ({ corridor: h.corridor, officers: h.officers, window: h.timeWindow, delta: `−${h.delayDelta}m` })),
        focusId: "hebbal",
      },
    };
  }
  if (ql.includes("south orr") || ql.includes("silk")) {
    return {
      role: "assistant",
      text: "South ORR is anchored by Silk Board, the single most critical junction in the network.",
      focusId: "silk-board",
      plan: {
        title: "South ORR · Pre-Shift Plan",
        rows: ranked.filter((h) => ["silk-board", "marathahalli"].includes(h.id)).map((h) => ({ corridor: h.corridor, officers: h.officers, window: h.timeWindow, delta: `−${h.delayDelta}m` })),
        focusId: "silk-board",
      },
    };
  }
  const top = ranked[0];
  return {
    role: "assistant",
    text: `The corridor saving the most delay is ${top.corridor}, where targeted enforcement recovers ${top.delayDelta} minutes at peak. It is also the top-ranked critical hotspot.`,
    focusId: top.id,
    plan: {
      title: "Highest-Yield Action",
      rows: ranked.slice(0, 3).map((h) => ({ corridor: h.corridor, officers: h.officers, window: h.timeWindow, delta: `−${h.delayDelta}m` })),
      focusId: top.id,
    },
  };
}

function Copilot() {
  const { setMapFocus } = useApp();
  const { summary } = useTelemetry();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, streaming]);

  const send = async (q: string) => {
    if (!q.trim()) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setStreaming("Connecting to Traffic Command Center...");

    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: q,
          context: null,
          history: messages.map((m) => ({
            role: m.role,
            content: m.text,
          })),
          liveData: summary ? {
            total_hotspots: summary.total_hotspots,
            total_violations: summary.total_violations,
            total_savings: summary.total_savings,
          } : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Server returned error status");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No readable stream in response");

      let assistantText = "";
      setStreaming("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value);
        const lines = chunkText.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content || "";
              assistantText += content;
              setStreaming(assistantText);
            } catch (err) {
              // Ignore partial/malformed JSON lines
            }
          }
        }
      }

      setStreaming("");

      let focusId: string | undefined = undefined;
      const lowerText = assistantText.toLowerCase();
      if (lowerText.includes("silk") || lowerText.includes("board")) focusId = "silk-board";
      else if (lowerText.includes("hebbal")) focusId = "hebbal";
      else if (lowerText.includes("market") || lowerText.includes("kr")) focusId = "kr-market";
      else if (lowerText.includes("marathahalli")) focusId = "marathahalli";
      else if (lowerText.includes("whitefield")) focusId = "whitefield";
      else if (lowerText.includes("indiranagar")) focusId = "indiranagar";
      else if (lowerText.includes("jayanagar")) focusId = "jayanagar";
      else if (lowerText.includes("majestic")) focusId = "majestic";

      setMessages((m) => [...m, { role: "assistant", text: assistantText, focusId }]);
      inputRef.current?.focus();

    } catch (err) {
      console.warn("Copilot API failed or timed out. Falling back to local commander simulator.", err);
      const reply = answerFor(q);
      const words = reply.text.split(" ");
      let i = 0;
      setStreaming("");
      const id = setInterval(() => {
        i++;
        setStreaming(words.slice(0, i).join(" "));
        if (i >= words.length) {
          clearInterval(id);
          setStreaming("");
          setMessages((m) => [...m, reply]);
          inputRef.current?.focus();
        }
      }, 35);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-3xl">
      <SectionHeader title="Copilot · Agentic Enforcement Planner" subtitle="Ask what-if questions, get structured deployment plans" />

      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-3">
            <Eyebrow>Suggested queries</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="px-3 py-1.5 text-xs border border-hairline text-text-muted hover:border-signal hover:text-text-primary">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "bg-surface-2 px-3 py-2 text-sm max-w-[80%]" : "max-w-[90%] space-y-2"}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
              {m.focusId && (
                <button onClick={() => { setMapFocus(m.focusId!); navigate({ to: "/" }); }} className="text-signal text-xs hover:underline">
                  View on map →
                </button>
              )}
              {m.plan && (
                <div className="border border-hairline bg-surface p-3 mt-1">
                  <Eyebrow>{m.plan.title}</Eyebrow>
                  <div className="mt-2 space-y-1.5">
                    {m.plan.rows.map((r, j) => (
                      <div key={j} className="flex items-center justify-between text-xs border-b border-hairline last:border-0 pb-1.5">
                        <span className="flex items-center gap-2"><Beacon severity="high" />{r.corridor}</span>
                        <span className="readout text-text-muted">{r.officers} ofc · {r.window} · <span style={{ color: "var(--signal)" }}>{r.delta}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {streaming && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {streaming}
            <span className="inline-block w-1.5 h-4 bg-signal ml-0.5 align-middle alarm" />
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-hairline pt-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the enforcement planner…"
          className="flex-1 bg-surface border border-hairline px-3 py-2 text-sm outline-none focus:border-signal"
        />
        <button type="submit" className="bg-signal text-primary-foreground px-4 flex items-center gap-1.5 text-sm">
          <Send size={14} /> Send
        </button>
      </form>
    </div>
  );
}

