"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";

interface AIAlert {
  time: string;
  station: string;
  type: "CRITICAL" | "OPTIMIZED" | "WARNING" | "SYSTEM";
  text: string;
}

const INITIAL_ALERTS: AIAlert[] = [
  { time: "13:14", station: "Halasuru Gate",  type: "CRITICAL",  text: "Critical illegal parking hotspot flagged. Capacity loss ~34%." },
  { time: "13:12", station: "Magadi Road",    type: "OPTIMIZED", text: "Optimal enforcement window calculated. Clamping action recommended." },
  { time: "13:09", station: "Shivajinagar",  type: "WARNING",   text: "Secondary road choke threshold exceeded (RCF > 25%)." },
  { time: "13:05", station: "HAL Old Airport",type: "WARNING",   text: "Arterial segment capacity constriction detected." },
  { time: "13:01", station: "SYSTEM",         type: "SYSTEM",    text: "ST-GATv2 forward pass complete. Risk scores updated." },
];

const MOCK_ALERTS: Omit<AIAlert, "time">[] = [
  { station: "HSR Layout",    type: "OPTIMIZED", text: "Patrol window optimized for peak commercial hours." },
  { station: "Chikkajala",    type: "WARNING",   text: "High-occupancy lane constricted. Estimated delay +1.5 min/vehicle." },
  { station: "City Market",   type: "CRITICAL",  text: "Double-parking queue wave backing onto main arterial." },
  { station: "Hebbala",       type: "OPTIMIZED", text: "Flyover junction cleared. Flow density normalized." },
  { station: "SYSTEM",        type: "SYSTEM",    text: "Neighbor attention weights updated. Flow correlation: 0.847." },
];

const TYPE_DOT: Record<string, string> = {
  CRITICAL:  "bg-red-500",
  WARNING:   "bg-amber-500",
  OPTIMIZED: "bg-emerald-500",
  SYSTEM:    "bg-slate-400",
};

export default function ActivityFeed() {
  const [alerts, setAlerts] = useState<AIAlert[]>(INITIAL_ALERTS);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const base = MOCK_ALERTS[Math.floor(Math.random() * MOCK_ALERTS.length)];
      setAlerts(prev => [{ ...base, time }, ...prev.slice(0, 9)]);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Build a doubled string for seamless loop
  const tickerItems = [...alerts, ...alerts];

  return (
    <div className="h-full w-full flex items-center glass-panel overflow-hidden relative">
      {/* Left: Live indicator */}
      <div className="flex items-center gap-2 px-4 shrink-0 border-r border-white/30 h-full">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-glow" />
        <Radio className="h-3 w-3 text-blue-600" />
        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Live Feed</span>
      </div>

      {/* Scrolling ticker */}
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-track">
          {tickerItems.map((alert, idx) => (
            <span key={idx} className="inline-flex items-center gap-2 mx-6">
              <span className={`h-1 w-1 rounded-full shrink-0 ${TYPE_DOT[alert.type]}`} />
              <span className="text-[9px] font-mono text-slate-400 tabular-nums">{alert.time}</span>
              <span className="text-[9px] font-semibold text-slate-600">{alert.station}</span>
              <span className="text-[9px] text-slate-400 font-medium">{alert.text}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
