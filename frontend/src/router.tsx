import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Factory function to create and configure the application router
// This sets up TanStack Router with React Query for state management and data fetching
export const getRouter = () => {
  // Initialize React Query client for managing server state and caching
  const queryClient = new QueryClient();

  // Create the router with configuration options
  const router = createRouter({
    routeTree, // Route structure generated from file-based routing
    context: { queryClient }, // Pass query client to all routes
    scrollRestoration: true, // Restore scroll position when navigating back
    defaultPreloadStaleTime: 0, // Preload routes when they become stale
  });

  return router;
};
