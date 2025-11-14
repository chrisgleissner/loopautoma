import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { RegionOverlay } from "./components/RegionOverlay";
import { getCurrentWindow } from "@tauri-apps/api/window";

async function bootstrap() {
  const rootEl = document.getElementById("root") as HTMLElement;
  let Component: React.ComponentType = App;

  if (typeof window !== "undefined" && (window as any).__TAURI_IPC__) {
    try {
      const current = await getCurrentWindow();
      if (current.label === "region-overlay") {
        Component = RegionOverlay;
      }
    } catch (err) {
      console.warn("Unable to determine window label:", err);
    }
  }

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <Component />
    </React.StrictMode>,
  );
}

bootstrap();
