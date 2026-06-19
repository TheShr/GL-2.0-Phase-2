"use client";

import React, { useState, useEffect, useRef } from "react";
import { Bot, X, Send, MapPin, Sparkles, AlertCircle } from "lucide-react";

interface Hotspot {
  rank: number;
  cluster_id: number;
  police_station: string;
  road_class: string;
  lanes: number;
  lat: number;
  lon: number;
  predicted_risk_index: number;
  capacity_reduction_rcf: number;
  travel_time_before: string;
  travel_time_after: string;
  delay_savings_per_vehicle: string;
  total_commuter_time_saved_hours: number;
  priority_score: number;
  target_shift: string;
  enforcement_action: string;
  logistics_weight: number;
  logistics_penalty_index: number;
}

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
}

interface TrafficCommanderProps {
  hotspots: Hotspot[];
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export default function TrafficCommander({ hotspots, isOpen, onClose, onOpen }: TrafficCommanderProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content: "Hello! I am the GridLock AI Traffic Commander. Click any hotspot on the map to inspect it, or ask me to formulate patrol schedules, analyze bottlenecks, or suggest enforcement deployments.",
    },
  ]);
  const [activeContext, setActiveContext] = useState<{
    hotspot: string;
    risk: number;
    delay_savings: number;
    logistics_impact: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);



  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for custom event dispatched when clicking map hotspots
  useEffect(() => {
    const handleInjectHotspot = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { hotspot, risk, delay_savings, logistics_impact } = customEvent.detail;

      // Select active context
      setActiveContext({ hotspot, risk, delay_savings, logistics_impact });

      // Auto-open chat panel
      onOpen();

      // Append system/notification trace
      const systemAlert: Message = {
        id: Date.now(),
        role: "assistant",
        content: `🔍 Loaded context for hotspot [${hotspot}]: Risk at ${Math.round(risk * 100)}%, Commuter savings of ${delay_savings} hours/hr, and ${logistics_impact} logistics priority. Ready to analyze.`,
      };
      setMessages(prev => [...prev, systemAlert]);
    };

    window.addEventListener("copilot-inject-hotspot", handleInjectHotspot);
    return () => window.removeEventListener("copilot-inject-hotspot", handleInjectHotspot);
  }, [onOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: input,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          context: activeContext,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          liveData: {
            total_hotspots: hotspots.length,
            total_violations: hotspots.reduce((sum, h) => sum + Math.round(h.predicted_risk_index * 120), 0),
            total_savings: hotspots.reduce((sum, h) => sum + Math.round(h.total_commuter_time_saved_hours), 0),
          },
        }),
      });

      if (!response.ok) throw new Error("Connection failed");

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const botMessageId = Date.now() + 1;
      let botMessage = { id: botMessageId, role: "assistant" as const, content: "" };
      setMessages(prev => [...prev, botMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const rawData = line.slice(6).trim();
            if (rawData === "[DONE]") continue;

            try {
              const parsed = JSON.parse(rawData);
              const content = parsed.choices[0]?.delta?.content || "";

              botMessage.content += content;
              setMessages(prev =>
                prev.map(m => (m.id === botMessageId ? { ...m, content: botMessage.content } : m))
              );
            } catch (e) {
              // Gracefully bypass formatting fragments
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: "⚠️ Connection error. Please verify Groq API Key configuration and local server status.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Panel Chat Drawer */}
      {isOpen && (
        <div
          className="absolute top-3 right-3 z-[100] w-[380px] h-[520px] max-h-[calc(100%-24px)] flex flex-col min-h-0 overflow-hidden animate-slide-up text-slate-800 rounded-2xl shadow-2xl"
          style={{
            background: "rgba(255, 255, 255, 0.40)",
            border: "1px solid rgba(255, 255, 255, 0.35)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)"
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-white/20"
            style={{ background: "rgba(255, 255, 255, 0.25)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center border border-white/30"
                style={{ background: "rgba(255, 255, 255, 0.30)" }}
              >
                <Bot className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-slate-900 leading-tight">Traffic Commander</p>
                <p className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase leading-none mt-0.5">GridLock Copilot</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-6.5 w-6.5 rounded-md hover:bg-white/40 transition-all flex items-center justify-center cursor-pointer text-slate-500 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Active Context Banner */}
          {activeContext && (
            <div
              className="border-b border-blue-500/20 px-4 py-2 flex items-center justify-between text-blue-900"
              style={{ background: "rgba(239, 246, 255, 0.30)" }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="text-[10px] font-bold text-blue-700 truncate">
                  Inspect: {activeContext.hotspot} ({Math.round(activeContext.risk * 100)}% risk)
                </span>
              </div>
              <button
                onClick={() => setActiveContext(null)}
                className="text-[9px] text-slate-600 hover:text-slate-800 font-bold uppercase tracking-wider cursor-pointer border border-white/30 px-2 py-0.5 rounded transition-all shadow-sm"
                style={{ background: "rgba(255, 255, 255, 0.40)" }}
              >
                Clear
              </button>
            </div>
          )}

          {/* Messages Feed */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4 bg-transparent">
            {messages.map((m) => {
              const isContext = m.content.includes("🔍 Loaded context");
              const isError = m.content.startsWith("⚠️") || m.content.startsWith("Connection error");
              return (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 max-w-[85%] text-[11px] leading-relaxed shadow-sm backdrop-blur-md ${m.role === "user"
                        ? "bg-gradient-to-r from-blue-600/80 to-sky-500/80 text-white rounded-br-none font-medium border border-white/10"
                        : isContext
                          ? "bg-blue-500/10 text-blue-900 border border-blue-500/20 rounded-bl-none font-semibold"
                          : isError
                            ? "bg-rose-500/10 text-rose-900 border border-rose-500/20 rounded-bl-none font-semibold"
                            : "bg-white/60 text-slate-900 border border-white/40 rounded-bl-none font-medium"
                      }`}
                    style={{ whiteSpace: "pre-line" }}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Form */}
          <form
            onSubmit={handleSend}
            className="p-3 border-t border-white/20 flex gap-2"
            style={{ background: "rgba(255, 255, 255, 0.25)" }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={activeContext ? `Analyze ${activeContext.hotspot}...` : "Ask commander about allocations..."}
              className="flex-1 border border-white/30 rounded-xl px-3.5 py-2 text-[11px] focus:outline-none focus:border-blue-500 focus:bg-white/90 placeholder:text-slate-500 text-slate-800 shadow-inner"
              style={{ background: "rgba(255, 255, 255, 0.40)" }}
              disabled={loading}
            />
            <button
              type="submit"
              className="h-8.5 w-8.5 rounded-xl bg-gradient-to-r from-blue-600/80 to-sky-500/80 hover:from-blue-600 hover:to-sky-500 flex items-center justify-center cursor-pointer transition-all active:scale-95 border border-white/20 text-white disabled:opacity-50 shadow-sm"
              disabled={loading || !input.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
