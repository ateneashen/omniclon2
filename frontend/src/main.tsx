import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./index.css";

// Global visible error handlers (for cases where React doesn't catch it)
window.onerror = (message, _source, _lineno, _colno, error) => {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed; bottom:0; left:0; right:0; background:#7f1d1d; color:#fecaca; padding:12px; z-index:999999; font-family:monospace; font-size:12px; white-space:pre-wrap;";
  el.textContent = `GLOBAL ERROR:\n${message}\n\n${error?.stack || ""}`;
  document.body.appendChild(el);
};

window.addEventListener("unhandledrejection", (event) => {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed; bottom:40px; left:0; right:0; background:#7f1d1d; color:#fecaca; padding:12px; z-index:999999; font-family:monospace; font-size:12px; white-space:pre-wrap;";
  el.textContent = `UNHANDLED PROMISE REJECTION:\n${event.reason}`;
  document.body.appendChild(el);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
