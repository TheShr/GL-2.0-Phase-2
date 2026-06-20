import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { MissionMap, MapLegend, type HeatmapLayer } from "@/components/MissionMap";
import { useApp } from "@/lib/app-context";

export function MapDock() {
  const [expanded, setExpanded] = useState(false);
  const [heatmapCase, setHeatmapCase] = useState<HeatmapLayer>("risk");
  const { mapFocus, setMapFocus } = useApp();

  return (
    <aside
      className="hidden lg:flex flex-col border-l border-hairline bg-surface transition-all duration-300"
      style={{ width: expanded ? "46%" : "19%" }}
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-hairline shrink-0">
        <span className="wordmark text-[10px]">Map Dock</span>
        <button onClick={() => setExpanded((e) => !e)} className="text-text-muted hover:text-text-primary">
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <MissionMap 
          compact 
          focus={mapFocus} 
          heatmapCase={heatmapCase} 
          setHeatmapCase={setHeatmapCase} 
          onSelect={(h) => setMapFocus(String(h.cluster_id))}
          expanded={expanded}
        />
      </div>
      <div className="px-3 py-2 border-t border-hairline shrink-0">
        <MapLegend heatmapCase={heatmapCase} />
      </div>
    </aside>
  );
}
