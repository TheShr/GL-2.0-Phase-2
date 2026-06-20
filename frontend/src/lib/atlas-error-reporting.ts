type AtlasErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type AtlasEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: AtlasErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: AtlasEvents; // Keep for compatibility with build environment hook
  }
}

export function reportAtlasError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}
