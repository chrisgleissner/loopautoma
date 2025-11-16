import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { RegionOverlay } from "./components/RegionOverlay";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktopEnvironment } from "./utils/runtime";

async function bootstrap() {
  const rootEl = document.getElementById("root") as HTMLElement;
  let Component: React.ComponentType = App;
  const isTauri = isDesktopEnvironment();

  if (isTauri) {
    try {
      const current = await getCurrentWindow();
      if (current.label === "region-overlay") {
        Component = RegionOverlay;
      }
    } catch (err) {
      console.warn("Unable to determine window label:", err);
    }
  }

  const render = () =>
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <Component />
      </React.StrictMode>,
    );

  if (isTauri) {
    render();
  } else {
    render();
  }
}

bootstrap();
