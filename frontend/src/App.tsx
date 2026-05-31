import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import BootstrapSplash from "./components/BootstrapSplash";

// Temporary main interface placeholder
function MainInterface() {
  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-semibold mb-3">OmniClon 2</h1>
        <p className="text-white/60">Main interface coming soon (A/B Roll + Voice Cloning)</p>
        <p className="text-xs text-white/40 mt-8">Backend is running. Phase 0 complete.</p>
      </div>
    </div>
  );
}

function App() {
  const [isReady, setIsReady] = useState(false);

  // Simple readiness check — in a real ambitious version this would come from the splash itself
  useEffect(() => {
    const check = async () => {
      try {
        const status: any = await invoke("get_bootstrap_status");
        if (status.is_healthy && status.stage === "ready") {
          // Small delay for polish
          setTimeout(() => setIsReady(true), 650);
        }
      } catch {
        // ignore during early bootstrap
      }
    };

    const interval = setInterval(check, 900);
    check();

    return () => clearInterval(interval);
  }, []);

  if (!isReady) {
    return <BootstrapSplash />;
  }

  return <MainInterface />;
}

export default App;