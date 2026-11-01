import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-8">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-2xl font-semibold text-text">Something went wrong</h1>
            {/* Raw error text can name tables and columns (SEC-06); it is in the console. */}
            <p className="text-sm text-text-muted">An unexpected error occurred. Reloading usually fixes it.</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-2 bg-[#c96442] text-white rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Fallback for one page: the shell around it keeps working (SEC-12). */
export function PageErrorCard() {
  return (
    <div role="alert" className="max-w-md mx-auto mt-12 rounded-2xl border border-border bg-surface p-6 text-center space-y-3">
      <h2 className="text-lg font-semibold text-text">This page hit an error</h2>
      <p className="text-sm text-text-muted">Other pages still work. Reload to try this one again.</p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 rounded-lg border border-border text-sm text-text hover:bg-surface-hover transition-colors"
      >
        Reload page
      </button>
    </div>
  );
}
