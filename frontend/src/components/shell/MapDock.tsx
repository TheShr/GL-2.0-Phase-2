import { useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { MissionMap, MapLegend, type HeatmapLayer } from "@/components/MissionMap";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

interface MapDockProps {
  showMobile?: boolean;
  onCloseMobile?: () => void;
}

export function MapDock({ showMobile = false, onCloseMobile }: MapDockProps) {
  const [expanded, setExpanded] = useState(false);
  const [heatmapCase, setHeatmapCase] = useState<HeatmapLayer>("risk");
  const { mapFocus, setMapFocus } = useApp();

  return (
    <aside
      className={cn(
        "flex-col border-l border-hairline bg-surface transition-all duration-300",
        showMobile 
          ? "flex absolute inset-0 z-40 w-full h-full" 
          : "hidden lg:flex"
      )}
      style={showMobile ? {} : { width: expanded ? "46%" : "19%" }}
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-hairline shrink-0">
        <span className="wordmark text-[10px]">Map Dock (OSM)</span>
        <div className="flex items-center gap-2">
          {showMobile ? (
            <button 
              onClick={onCloseMobile} 
              className="text-text-muted hover:text-text-primary p-1 border-none bg-transparent cursor-pointer"
            >
              <X size={14} />
            </button>
          ) : (
            <button 
              onClick={() => setExpanded((e) => !e)} 
              className="text-text-muted hover:text-text-primary border-none bg-transparent cursor-pointer"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <MissionMap 
          compact 
          focus={mapFocus} 
          heatmapCase={heatmapCase} 
          setHeatmapCase={setHeatmapCase} 
          onSelect={(h) => setMapFocus(String(h.cluster_id))}
          expanded={expanded || showMobile}
        />
      </div>
      <div className="px-3 py-2 border-t border-hairline shrink-0">
        <MapLegend heatmapCase={heatmapCase} />
      </div>
    </aside>
  );
}
