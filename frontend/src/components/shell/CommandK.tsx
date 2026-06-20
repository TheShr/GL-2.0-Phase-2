import { useNavigate } from "@tanstack/react-router";
import { useApp } from "@/lib/app-context";
import { useTelemetry } from "@/lib/telemetry-context";
import { Beacon } from "@/components/hud";
import { useState, useEffect } from "react";

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
  const { hotspots } = useTelemetry();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  useEffect(() => {
    if (!cmdkOpen) return;
    if (q.trim().length < 2) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await fetch(`/api/autosuggest?query=${encodeURIComponent(q)}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data || []);
        }
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [q, cmdkOpen]);

  if (!cmdkOpen) return null;

  const ql = q.toLowerCase();
  const pages = PAGES.filter((p) => p.label.toLowerCase().includes(ql));
  const spots = hotspots.filter((h) => h.name.toLowerCase().includes(ql) || h.corridor.toLowerCase().includes(ql));

  const close = () => {
    setCmdkOpen(false);
    setQ("");
    setSuggestions([]);
  };

  const handleSelectSuggestion = async (s: any) => {
    try {
      const res = await fetch(`/api/place-detail?eloc=${s.eLoc}`);
      if (res.ok) {
        const coords = await res.json();
        if (coords.latitude != null && coords.longitude != null) {
          setMapFocus(`${coords.latitude},${coords.longitude},${s.placeName || s.name}`);
        }
      }
    } catch (err) {
      console.error("Error geocoding location:", err);
    } finally {
      navigate({ to: "/" });
      close();
    }
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
        <div className="max-h-80 overflow-y-auto p-2 custom-scrollbar">
          {pages.length > 0 && (
            <>
              <div className="eyebrow px-2 py-1">Pages</div>
              {pages.map((p) => (
                <button
                  key={p.to}
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-2 cursor-pointer transition-colors"
                  onClick={() => {
                    navigate({ to: p.to });
                    close();
                  }}
                >
                  {p.label}
                </button>
              ))}
            </>
          )}

          {spots.length > 0 && (
            <>
              <div className="eyebrow px-2 py-1 mt-2">Hotspots</div>
              {spots.map((h) => (
                <button
                  key={h.id}
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2 cursor-pointer transition-colors"
                  onClick={() => {
                    setMapFocus(h.id);
                    navigate({ to: "/" });
                    close();
                  }}
                >
                  <Beacon severity={h.severity} />
                  <span>{h.name}</span>
                  <span className="readout text-xs text-text-muted ml-auto">{h.riskScore}%</span>
                </button>
              ))}
            </>
          )}

          {suggestions.length > 0 && (
            <>
              <div className="eyebrow px-2 py-1 mt-2">Suggested Locations (Mappls)</div>
              {suggestions.map((s, idx) => (
                <button
                  key={s.eLoc || idx}
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-surface-2 flex flex-col cursor-pointer transition-colors"
                  onClick={() => handleSelectSuggestion(s)}
                >
                  <span className="font-medium text-text-primary text-xs">{s.placeName || s.name}</span>
                  {s.placeAddress && (
                    <span className="text-[10px] text-text-muted truncate">{s.placeAddress}</span>
                  )}
                </button>
              ))}
            </>
          )}

          {isLoadingSuggestions && (
            <div className="text-center py-2 text-xs text-text-muted animate-pulse">
              Searching Mappls locations…
            </div>
          )}

          {pages.length === 0 && spots.length === 0 && suggestions.length === 0 && !isLoadingSuggestions && (
            <div className="text-center py-4 text-xs text-text-muted">
              No results found for "{q}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
