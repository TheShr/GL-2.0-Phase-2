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
    <nav className="fixed left-0 top-12 bottom-0 z-40 w-16 border-r border-hairline bg-surface flex flex-col">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center gap-1 py-3 border-l-2 transition-colors",
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
