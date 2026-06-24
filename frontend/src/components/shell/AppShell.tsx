import { useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { MapDock } from "./MapDock";
import { CommandK } from "./CommandK";
import { cn } from "@/lib/utils";
import { Map as MapIcon, FileText } from "lucide-react";

// Main application shell component that provides the overall layout structure
// Includes navigation bars, sidebar, and responsive layout management
export function AppShell({ children }: { children: ReactNode }) {
  // Get current pathname to determine if on command/home page
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Check if we're on the root command page
  const isCommand = pathname === "/";
  // State to toggle between showing content details or map on mobile
  const [showMobileMap, setShowMobileMap] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas text-text-primary">
      {/* Top navigation bar with branding and controls */}
      <TopBar />
      {/* Left sidebar with navigation links and options */}
      <LeftRail />
      {/* Command/search palette component */}
      <CommandK />
      {/* Main content area with responsive positioning */}
      <main className="absolute top-12 left-0 md:left-16 right-0 bottom-16 md:bottom-0">
        {isCommand ? (
          // On command page, full-width display for children
          <div className="h-full w-full">{children}</div>
        ) : (
          // On other pages, show split layout with content and map
          <div className="flex h-full w-full relative">
            {/* Content section - shows details/analytics panels */}
            <div className={cn(
              "flex-1 min-w-0 overflow-y-auto p-5 transition-all duration-300",
              showMobileMap ? "hidden lg:block" : "block"
            )}>
              {children}
            </div>
            
            {/* Map container with responsive behavior */}
            <MapDock 
              showMobile={showMobileMap} 
              onCloseMobile={() => setShowMobileMap(false)} 
            />

            {/* Mobile toggle button - switches between details and map view */}
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
