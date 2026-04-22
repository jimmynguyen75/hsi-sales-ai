import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import { ToastProvider, useToast } from "@/components/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Bridge: react-query caches are module-level, but useToast() is React-scoped.
// We let a tiny component register the toast handler on mount so cache errors
// can flow to the UI without prop-drilling.
type ToastFn = (message: string, detail?: string) => void;
const handler: { error: ToastFn | null } = { error: null };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (err, query) => {
      // Don't toast on background refetches where there's already cached data
      // — user hasn't asked for fresh data, keep it quiet.
      if (query.state.data !== undefined) return;
      handler.error?.("Không tải được dữ liệu", (err as Error).message);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      handler.error?.("Thao tác thất bại", (err as Error).message);
    },
  }),
});

function ToastBridge() {
  const toast = useToast();
  useEffect(() => {
    handler.error = toast.error;
    return () => {
      handler.error = null;
    };
  }, [toast]);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <ToastBridge />
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
