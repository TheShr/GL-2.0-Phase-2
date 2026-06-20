import { createContext, useContext, useState, type ReactNode } from "react";

type ReportMode = "priority" | "audit";

interface AppState {
  reportMode: ReportMode;
  setReportMode: (m: ReportMode) => void;
  mapFocus: string | null;
  setMapFocus: (id: string | null) => void;
  cmdkOpen: boolean;
  setCmdkOpen: (o: boolean) => void;
  timeLapseHour: number | null;
  setTimeLapseHour: (h: number | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [reportMode, setReportMode] = useState<ReportMode>("priority");
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [timeLapseHour, setTimeLapseHour] = useState<number | null>(null);

  return (
    <Ctx.Provider
      value={{
        reportMode,
        setReportMode,
        mapFocus,
        setMapFocus,
        cmdkOpen,
        setCmdkOpen,
        timeLapseHour,
        setTimeLapseHour,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
