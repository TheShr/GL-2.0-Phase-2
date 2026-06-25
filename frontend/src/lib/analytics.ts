/**
 * analytics.ts
 *
 * Thin, typed wrapper around the Google Analytics 4 (GA4) gtag.js API.
 * The gtag script itself is injected via the <head> in __root.tsx so this
 * module only provides helper functions — it does NOT inject any script tags.
 *
 * Usage:
 *   import { pageView, event } from '~/lib/analytics';
 *   pageView('/dashboard');
 *   event('map_interaction', { action: 'zoom', label: 'hotspot_cluster' });
 */

export const GA_MEASUREMENT_ID = "G-8TJW5MXZS2";

// ---------------------------------------------------------------------------
// Type augmentation: make TypeScript aware of the global gtag function
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    dataLayer: unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag: (...args: any[]) => void;
  }
}

/** Returns true when gtag is loaded and available on window. */
function isGtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/**
 * Sends a `page_view` hit to GA4.
 *
 * Call this on every client-side navigation. The first page view is fired
 * automatically by gtag.js when it initialises via `gtag('config', ...)`.
 *
 * @param path - The URL pathname to record (e.g. "/dashboard").
 * @param title - Optional document title override.
 */
export function pageView(path: string, title?: string): void {
  if (!isGtagReady()) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: title ?? document.title,
    send_to: GA_MEASUREMENT_ID,
  });
}

/**
 * Sends a custom event to GA4.
 *
 * @param eventName - GA4 event name (snake_case recommended).
 * @param params    - Optional event parameters.
 */
export function event(
  eventName: string,
  params?: Record<string, unknown>,
): void {
  if (!isGtagReady()) return;
  window.gtag("event", eventName, { send_to: GA_MEASUREMENT_ID, ...params });
}
