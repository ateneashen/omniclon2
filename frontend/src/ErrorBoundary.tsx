import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error in React tree:", error, errorInfo);
    // Also paint it visibly
    const el = document.createElement("div");
    el.style.cssText = "position:fixed; top:0; left:0; right:0; background:#b91c1c; color:white; padding:12px; z-index:99999; font-family:monospace; white-space:pre-wrap;";
    el.textContent = `REACT CRASH:\n${error.message}\n\n${error.stack}`;
    document.body.appendChild(el);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: "#111", color: "#f87171", fontFamily: "monospace", height: "100vh" }}>
          <h1 style={{ color: "white" }}>React crashed</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <p>Check the red bar at the top of the window for more details.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
