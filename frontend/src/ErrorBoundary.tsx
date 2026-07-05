import { Component, ReactNode } from 'react';
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react';
import { logError } from './lib/log';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
    logError('ErrorBoundary', 'Uncaught React error', error, {
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, copied: false });
  };

  handleCopyError = async () => {
    const { error } = this.state;
    const text = error
      ? `${error.message}\n\n${error.stack || ''}`
      : 'Unknown error';
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[var(--nle-bg-app)] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <h1 className="text-xl font-semibold mb-2">OmniClon 2 encontró un error</h1>
          <p className="text-white/55 text-sm mb-4 max-w-md leading-relaxed">
            La interfaz falló inesperadamente. El error se registró en los logs de diagnóstico.
            Puedes copiar los detalles para soporte.
          </p>
          <pre className="text-left text-xs bg-black/50 p-4 rounded-md max-w-2xl max-h-[50vh] overflow-auto whitespace-pre-wrap border border-red-500/20 text-red-200/90 font-mono w-full">
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={this.handleReset} className="nle-btn">
              <RotateCcw size={14} />
              Reintentar
            </button>
            <button type="button" onClick={this.handleCopyError} className="nle-btn text-red-300 border-red-500/30 bg-red-500/10">
              <Copy size={14} />
              {this.state.copied ? 'Copiado' : 'Copiar error'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
