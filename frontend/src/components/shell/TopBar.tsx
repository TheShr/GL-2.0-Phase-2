import { useEffect, useState } from "react";
import { Sun, Moon, Search } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

function IstClock() {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: "Asia/Kolkata",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      };
      setNow(new Intl.DateTimeFormat("en-US", options).format(new Date()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="readout text-text-primary">{now} IST</span>;
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
        <span className="wordmark text-xs font-bold uppercase tracking-wider">Atlas</span>
      </div>

      {/* spacer to push right controls to the far right */}
      <div className="flex-1" />

      {/* right controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* IST Clock pushed to the left-most side of right controls, adjacent to search */}
        <div className="text-[11px] text-text-muted mr-1 sm:mr-2 select-none">
          <IstClock />
        </div>

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
