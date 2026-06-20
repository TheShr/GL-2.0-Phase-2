import { useNavigate } from "@tanstack/react-router";
import { useApp } from "@/lib/app-context";
import { HOTSPOTS } from "@/lib/mock";
import { Beacon } from "@/components/hud";
import { useState } from "react";

const PAGES = [
  { label: "Command Center", to: "/" },
  { label: "Predictions & Analytics", to: "/predictions" },
  { label: "Optimizer & Simulation", to: "/optimizer" },
  { label: "Logistics Intelligence", to: "/logistics" },
  { label: "Explainability", to: "/explainability" },
  { label: "Reports", to: "/reports" },
  { label: "Copilot", to: "/copilot" },
];

export function CommandK() {
  const { cmdkOpen, setCmdkOpen, setMapFocus } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  if (!cmdkOpen) return null;

  const ql = q.toLowerCase();
  const pages = PAGES.filter((p) => p.label.toLowerCase().includes(ql));
  const spots = HOTSPOTS.filter((h) => h.name.toLowerCase().includes(ql) || h.corridor.toLowerCase().includes(ql));

  const close = () => {
    setCmdkOpen(false);
    setQ("");
  };

  return (
    <div className="fixed inset-0 z-[100] bg-canvas/80 backdrop-blur-sm flex items-start justify-center pt-[12vh]" onClick={close}>
      <div className="w-full max-w-xl border border-hairline bg-surface" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search corridors, junctions, pages…"
          className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-hairline"
          onKeyDown={(e) => e.key === "Escape" && close()}
        />
        <div className="max-h-80 overflow-y-auto p-2">
          <div className="eyebrow px-2 py-1">Pages</div>
          {pages.map((p) => (
            <button
              key={p.to}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-2"
              onClick={() => {
                navigate({ to: p.to });
                close();
              }}
            >
              {p.label}
            </button>
          ))}
          <div className="eyebrow px-2 py-1 mt-2">Hotspots</div>
          {spots.map((h) => (
            <button
              key={h.id}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2"
              onClick={() => {
                setMapFocus(h.id);
                navigate({ to: "/" });
                close();
              }}
            >
              <Beacon severity={h.severity} />
              <span>{h.name}</span>
              <span className="readout text-xs text-text-muted ml-auto">{h.riskScore}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
