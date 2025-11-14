import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

if (typeof window !== "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    width: number;
    height: number;
    pressure: number;
    tiltX: number;
    tiltY: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      this.pointerId = props.pointerId ?? 0;
      this.width = props.width ?? 0;
      this.height = props.height ?? 0;
      this.pressure = props.pressure ?? 0;
      this.tiltX = props.tiltX ?? 0;
      this.tiltY = props.tiltY ?? 0;
      this.pointerType = props.pointerType ?? "mouse";
      this.isPrimary = props.isPrimary ?? true;
      Object.defineProperty(this, "__loopautomaInit", {
        configurable: true,
        enumerable: false,
        value: { ...props },
      });
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: PointerEventPolyfill,
  });
  
  // Mock setPointerCapture and releasePointerCapture for jsdom
  if (typeof Element !== "undefined") {
    Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || function() {};
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || function() {};
  }
}

afterEach(() => {
  cleanup();
});

vi.mock("@tauri-apps/api/event", () => {
  return {
    listen: async (_name: string, _cb: any) => {
      return () => {};
    },
  };
});

vi.mock("@tauri-apps/api/core", () => {
  return {
    invoke: vi.fn(async () => ({})),
  };
});
