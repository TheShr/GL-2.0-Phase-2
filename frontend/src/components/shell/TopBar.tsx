import { useEffect, useState } from "react";
import { Sun, Moon, Search } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useApp } from "@/lib/app-context";
import { CITY_RISK_INDEX, OFFICERS_DEPLOYED } from "@/lib/mock";
import { cn } from "@/lib/utils";

function UtcClock() {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="readout">{now} UTC</span>;
}

export function TopBar() {
  const { theme, toggle } = useTheme();
  const { reportMode, setReportMode, setCmdkOpen } = useApp();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCmdkOpen]);

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-12 border-b border-hairline bg-surface flex items-center px-3 gap-2 sm:gap-4">
      {/* wordmark */}
      <div className="flex items-center gap-2 w-auto md:w-48 shrink-0">
        <span className="h-2 w-2 bg-signal" />
        <span className="wordmark text-xs">Atlas</span>
      </div>

      {/* telemetry strip */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-6 text-[11px] text-text-muted">
        <UtcClock />
        <span className="flex items-center gap-1.5">
          <span className="eyebrow">CITY RISK</span>
          <span className="readout text-text-primary">{CITY_RISK_INDEX}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="eyebrow">OFFICERS</span>
          <span className="readout text-text-primary">{OFFICERS_DEPLOYED}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="eyebrow">MODE</span>
          <span className="readout text-text-primary uppercase">{reportMode}</span>
        </span>
      </div>

      {/* spacer for mobile layout alignment */}
      <div className="flex-1 md:hidden" />

      {/* right controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={() => setCmdkOpen(true)}
          className="flex items-center gap-1.5 border border-hairline px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
        >
          <Search size={13} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="readout text-[9px] opacity-60 hidden sm:inline">⌘K</kbd>
        </button>

        <div className="flex border border-hairline">
          {(["priority", "audit"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setReportMode(m)}
              className={cn(
                "px-2 py-1 text-[10px] uppercase tracking-wider",
                reportMode === m ? "bg-signal text-primary-foreground" : "text-text-muted",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <button onClick={toggle} className="border border-hairline p-1.5 text-text-muted hover:text-text-primary">
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <div className="hidden sm:flex items-center gap-2 border border-hairline px-2 py-1">
          <span className="h-1.5 w-1.5 bg-signal" />
          <span className="text-[10px] uppercase tracking-wider text-text-muted">BTP · Cmd</span>
        </div>
      </div>
    </header>
  );
}
