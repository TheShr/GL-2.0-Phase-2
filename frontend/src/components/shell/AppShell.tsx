import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { TopBar } from "./TopBar";
import { LeftRail } from "./LeftRail";
import { MapDock } from "./MapDock";
import { CommandK } from "./CommandK";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCommand = pathname === "/";

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas text-text-primary">
      <TopBar />
      <LeftRail />
      <CommandK />
      <main className="absolute top-12 left-0 md:left-16 right-0 bottom-16 md:bottom-0">
        {isCommand ? (
          <div className="h-full w-full">{children}</div>
        ) : (
          <div className="flex h-full w-full">
            <div className="flex-1 min-w-0 overflow-y-auto p-5">{children}</div>
            <MapDock />
          </div>
        )}
      </main>
    </div>
  );
}
