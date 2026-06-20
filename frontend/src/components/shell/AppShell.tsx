import { useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { MapDock } from "./MapDock";
import { CommandK } from "./CommandK";
import { cn } from "@/lib/utils";
import { Map as MapIcon, FileText } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCommand = pathname === "/";
  const [showMobileMap, setShowMobileMap] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas text-text-primary">
      <TopBar />
      <LeftRail />
      <CommandK />
      <main className="absolute top-12 left-0 md:left-16 right-0 bottom-16 md:bottom-0">
        {isCommand ? (
          <div className="h-full w-full">{children}</div>
        ) : (
          <div className="flex h-full w-full relative">
            <div className={cn(
              "flex-1 min-w-0 overflow-y-auto p-5 transition-all duration-300",
              showMobileMap ? "hidden lg:block" : "block"
            )}>
              {children}
            </div>
            
            <MapDock 
              showMobile={showMobileMap} 
              onCloseMobile={() => setShowMobileMap(false)} 
            />

            {/* Floating Mobile Toggle Button */}
            <button
              onClick={() => setShowMobileMap(!showMobileMap)}
              className="lg:hidden fixed bottom-20 right-4 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-signal text-white font-semibold text-[10px] tracking-wider uppercase shadow-lg border-none cursor-pointer transition-all active:scale-95 animate-fade-in"
              style={{ boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3)" }}
            >
              {showMobileMap ? (
                <>
                  <FileText size={14} />
                  <span>Show Details</span>
                </>
              ) : (
                <>
                  <MapIcon size={14} />
                  <span>Show OSM Map</span>
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
