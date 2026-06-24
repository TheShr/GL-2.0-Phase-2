import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/mock";
import type { ReactNode } from "react";

/**
 * Readout Component - Mission-control style display element
 * Shows a label above a large monospace number with optional unit
 * Used to display key metrics and data in the dashboard
 */
export function Readout({
  label,
  value,
  unit,
  size = "lg",
  critical = false,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  size?: "sm" | "md" | "lg" | "xl";
  critical?: boolean;
  className?: string;
}) {
  // Map size prop to Tailwind text size classes
  const sizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl", xl: "text-6xl" };
  return (
    <div className={className}>
      {/* Small label text above the main value */}
      <div className="eyebrow">{label}</div>
      {/* Large monospace number display, uses critical color if needed */}
      <div
        className={cn("readout font-medium leading-none mt-1", sizes[size])}
        style={{ color: critical ? "var(--critical)" : "var(--text-primary)" }}
      >
        {value}
        {/* Optional unit text displayed at smaller size */}
        {unit ? <span className="text-text-muted text-[0.5em] ml-0.5 align-top">{unit}</span> : null}
      </div>
    </div>
  );
}

/**
 * Beacon Component - Status indicator square
 * Shows system status with visual severity levels (critical blinks, others fade)
 * Used throughout the dashboard for status monitoring
 */
export function Beacon({ severity, className }: { severity: Severity; className?: string }) {
  // Determine if this is a critical alert requiring animation
  const isCritical = severity === "critical";
  // Set opacity based on severity level - critical is always visible
  const opacity = severity === "high" ? 0.85 : severity === "elevated" ? 0.6 : 0.4;
  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0", isCritical && "alarm", className)}
      style={{
        // Critical status uses red color, others use muted text color
        backgroundColor: isCritical ? "var(--critical)" : "var(--text-muted)",
        // Critical is fully opaque, other severities fade
        opacity: isCritical ? 1 : opacity,
      }}
      aria-label={severity}
    />
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-hairline pb-3">
      <div>
        <h1 className="wordmark text-sm text-text-primary">{title}</h1>
        {subtitle ? <p className="text-xs text-text-muted mt-1">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Flat horizontal tab strip — every tab visible, no dropdowns. */
export function TabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-hairline">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "wordmark text-[10px] px-3 py-2 -mb-px border-b-2 transition-colors",
            active === t
              ? "border-signal text-text-primary"
              : "border-transparent text-text-muted hover:text-text-primary",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border border-hairline bg-surface", className)}>{children}</div>
  );
}

/** Grayscale proportional bar — severity by weight, never hue. */
export function FactorBar({ label, weight, max = 100 }: { label: string; weight: number; max?: number }) {
  const pct = Math.min(100, (weight / max) * 100);
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-40 shrink-0 text-xs text-text-muted truncate">{label}</div>
      <div className="flex-1 h-2 bg-surface-2">
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: "var(--text-primary)", opacity: 0.55 }} />
      </div>
      <div className="readout text-xs w-10 text-right">{weight}%</div>
    </div>
  );
}
