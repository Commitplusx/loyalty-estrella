import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // Here we could send the error to Sentry or another reporting service
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Optionally refresh the page to completely reset state
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[300px] p-6 text-center bg-gray-50 rounded-[2rem] border border-gray-100 z-50 relative">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2 tracking-tight">Ups, algo salió mal</h2>
          <p className="text-sm text-gray-500 max-w-[280px] mb-8">
            Ocurrió un error inesperado al cargar esta sección. Estamos trabajando en solucionarlo.
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 active:scale-95 transition-all shadow-md"
          >
            <RefreshCcw className="w-4 h-4" />
            Recargar aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
