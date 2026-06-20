import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Activity, SlidersHorizontal, Truck, GitBranch, FileText, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", icon: LayoutGrid, label: "Command" },
  { to: "/predictions", icon: Activity, label: "Predict" },
  { to: "/optimizer", icon: SlidersHorizontal, label: "Optimize" },
  { to: "/logistics", icon: Truck, label: "Logistics" },
  { to: "/explainability", icon: GitBranch, label: "Explain" },
  { to: "/reports", icon: FileText, label: "Reports" },
  { to: "/copilot", icon: MessageSquare, label: "Copilot" },
] as const;

export function LeftRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 w-full border-t border-hairline bg-surface flex flex-row items-center justify-around md:top-12 md:bottom-0 md:right-auto md:h-auto md:w-16 md:flex-col md:justify-start md:border-r md:border-t-0">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex-1 md:flex-initial flex flex-col items-center justify-center gap-1 py-2 md:py-3 border-b-2 md:border-b-0 md:border-l-2 transition-colors h-full md:h-auto",
              active
                ? "border-signal text-text-primary bg-surface-2"
                : "border-transparent text-text-muted hover:text-text-primary",
            )}
          >
            <Icon size={18} strokeWidth={1.6} />
            <span className="text-[8px] uppercase tracking-wider font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
