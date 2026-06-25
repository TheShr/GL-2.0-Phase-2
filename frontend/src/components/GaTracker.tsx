/**
 * GaTracker.tsx
 *
 * Client-side component that fires a GA4 `page_view` event on every
 * TanStack Router navigation. It subscribes to the router's `onResolved`
 * subscriber so it reacts to both hard navigations and soft (SPA) navigations.
 *
 * This component is rendered once inside <RootShell> in __root.tsx.
 */

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { pageView } from "../lib/analytics";

export function GaTracker() {
  const router = useRouter();

  useEffect(() => {
    // Subscribe fires after every resolved navigation (including the initial load).
    const unsubscribe = router.subscribe("onResolved", () => {
      pageView(router.state.location.pathname + router.state.location.search);
    });

    return () => {
      unsubscribe();
    };
  }, [router]);

  // This component renders no DOM — it only drives analytics side-effects.
  return null;
}
