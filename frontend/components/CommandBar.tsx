"use client";

import { useState, useRef, useEffect } from "react";
import { Menu, Search, Clock, Layers, Zap, Settings, X, Download, ChevronDown, Bot } from "lucide-react";

interface CommandBarProps {
  onToggleLeftDrawer: () => void;
  selectedTime: string;
  onSelectTime: (time: string) => void;
  visibleLayers: Record<string, boolean>;
  onToggleLayer: (layer: string) => void;
  onSimulateClick: () => void;
  judgeMode: boolean;
  onToggleJudgeMode: (val: boolean) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: any[];
  onSelectSearchResult: (res: any) => void;
  trafficCommanderOpen: boolean;
  onToggleTrafficCommander: () => void;
}

const TIME_SLOTS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];

const LAYER_OPTIONS = [
  { key: "hotspots", label: "Illegal Parking Hotspots", color: "bg-red-500" },
  { key: "routes", label: "Logistics Routes", color: "bg-blue-500" },
  { key: "patrols", label: "Patrol Units", color: "bg-emerald-500" },
  { key: "congestion", label: "Congestion Heatmap", color: "bg-amber-500" },
];

export default function CommandBar({
  onToggleLeftDrawer,
  selectedTime,
  onSelectTime,
  visibleLayers,
  onToggleLayer,
  onSimulateClick,
  judgeMode,
  onToggleJudgeMode,
  searchQuery,
  onSearchChange,
  searchResults,
  onSelectSearchResult,
  trafficCommanderOpen,
  onToggleTrafficCommander,
}: CommandBarProps) {
  const [timeOpen, setTimeOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const timeRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (timeRef.current && !timeRef.current.contains(e.target as Node)) setTimeOpen(false);
      if (layersRef.current && !layersRef.current.contains(e.target as Node)) setLayersOpen(false);
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="command-bar h-12 flex items-center px-4 gap-2 shrink-0 relative z-[95]">

      {/* Hamburger */}
      <button
        onClick={onToggleLeftDrawer}
        className="command-bar-btn !px-2.5"
        title="Intelligence Panel"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="h-6 w-6 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0077CC, #00A3FF)' }}>
          <Zap className="h-3 w-3 text-white" />
        </div>
        <span className="text-[12px] font-bold text-slate-900 tracking-tight hidden sm:block">GridLock 2.0</span>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-slate-200/60 mx-1" />

      {/* Search */}
      <div 
        className="relative flex-1 max-w-[280px]"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Search station or location..."
          className="w-full bg-white/40 border border-white/50 rounded-lg py-1.5 pr-3 text-[11px] focus:outline-none focus:border-blue-400/60 text-slate-700 placeholder:text-slate-400 transition-all"
          style={{ paddingLeft: "2.25rem" }}
        />
        {searchFocused && searchResults.length > 0 && (
          <div className="popover-panel left-0 right-0 !p-1 max-h-44 overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
            {searchResults.map((res: any, i: number) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectSearchResult(res);
                }}
                className="w-full text-left px-3 py-2 text-[10px] font-semibold text-slate-700 hover:bg-blue-50/50 rounded-lg transition-all truncate flex flex-col cursor-pointer border-none bg-transparent"
              >
                <span className="text-slate-900 font-bold truncate">{res.placeName || res.placeAddress}</span>
                <span className="text-[8px] text-slate-400 font-medium truncate mt-0.5">{res.placeAddress}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-slate-200/60 mx-1" />

      {/* Time Dropdown */}
      <div className="relative" ref={timeRef}>
        <button
          className={`command-bar-btn ${timeOpen ? 'active' : ''}`}
          onClick={() => { setTimeOpen(!timeOpen); setLayersOpen(false); setSettingsOpen(false); }}
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono text-[10px]">{selectedTime}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
        {timeOpen && (
          <div className="popover-panel right-0 !min-w-[160px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">Forecast Interval</span>
            <div className="flex flex-col gap-0.5">
              {TIME_SLOTS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { onSelectTime(t); setTimeOpen(false); }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-semibold text-left cursor-pointer border-none transition-all ${
                    selectedTime === t
                      ? 'bg-blue-50/80 text-blue-700 font-bold'
                      : 'text-slate-600 hover:bg-slate-50/80 bg-transparent'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Layers Dropdown */}
      <div className="relative" ref={layersRef}>
        <button
          className={`command-bar-btn ${layersOpen ? 'active' : ''}`}
          onClick={() => { setLayersOpen(!layersOpen); setTimeOpen(false); setSettingsOpen(false); }}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Layers</span>
          <ChevronDown className="h-3 w-3" />
        </button>
        {layersOpen && (
          <div className="popover-panel right-0 !min-w-[210px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">Map Overlays</span>
            <div className="flex flex-col gap-1">
              {LAYER_OPTIONS.map(l => (
                <label key={l.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50/80 cursor-pointer transition-all">
                  <input
                    type="checkbox"
                    checked={visibleLayers[l.key] ?? true}
                    onChange={() => onToggleLayer(l.key)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span className={`h-2 w-2 rounded-full shrink-0 ${l.color}`} />
                  <span className="text-[10px] font-semibold text-slate-700">{l.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Simulate CTA */}
      <button
        onClick={onSimulateClick}
        className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-[10px] font-bold text-white cursor-pointer transition-all hover:opacity-90 active:scale-95 border-none"
        style={{ background: 'linear-gradient(135deg, #0077CC, #00A3FF)' }}
      >
        <Zap className="h-3 w-3" />
        <span className="hidden sm:inline">Simulate</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* AI Traffic Commander Trigger */}
      <button
        className={`command-bar-btn !px-2.5 ${trafficCommanderOpen ? 'active' : ''}`}
        onClick={onToggleTrafficCommander}
        title="AI Traffic Commander"
      >
        <Bot className="h-3.5 w-3.5" />
      </button>

      {/* Settings */}
      <div className="relative" ref={settingsRef}>
        <button
          className={`command-bar-btn !px-2.5 ${settingsOpen ? 'active' : ''}`}
          onClick={() => { setSettingsOpen(!settingsOpen); setTimeOpen(false); setLayersOpen(false); }}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        {settingsOpen && (
          <div className="popover-panel right-0 !min-w-[180px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">Settings</span>
            <label className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50/80 cursor-pointer transition-all">
              <span className="text-[10px] font-semibold text-slate-700">Judge Mode</span>
              <input
                type="checkbox"
                checked={judgeMode}
                onChange={(e) => onToggleJudgeMode(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("open-dispatch-matrix"))}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50/80 cursor-pointer transition-all text-[10px] font-semibold text-slate-700 border-none bg-transparent text-left"
            >
              <Download className="h-3 w-3 text-slate-400" />
              Open Dispatch Matrix
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
