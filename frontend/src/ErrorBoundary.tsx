import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#111] text-red-400 font-mono flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-white text-xl mb-2">React crashed</h1>
          <pre className="text-left text-xs bg-black/50 p-4 rounded max-w-2xl max-h-[60vh] overflow-auto whitespace-pre-wrap">
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={this.handleReset}
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/15 rounded text-white text-sm transition"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
