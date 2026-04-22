import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
  /** Optional custom fallback. If not provided, uses the default panel. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors in descendants. API/query errors go through
 * react-query + toast, not here — this is strictly for bugs in component code.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-rose-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-rose-700 mb-3">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Có lỗi hiển thị trang này</h2>
          </div>
          <p className="text-sm text-slate-600 mb-1">
            Giao diện gặp lỗi không mong muốn. Thông tin của bạn đã được lưu — không mất dữ liệu.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-3 text-[11px] text-slate-700">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <Button onClick={this.reset}>
              <RefreshCw className="h-4 w-4" />
              Thử lại
            </Button>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
