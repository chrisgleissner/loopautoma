type TestHarness = {
  state?: Record<string, unknown>;
  emit?: (channel: string, payload: unknown) => void;
  invoke?: (cmd: string, args?: unknown) => Promise<any>;
};

const hasWindow = typeof window !== "undefined";

export const getTestHarness = (): TestHarness | undefined => (hasWindow ? ((window as any).__LOOPAUTOMA_TEST__ as TestHarness | undefined) : undefined);

const hasTauriGlobals = (target: any) => Boolean(target.__TAURI__ || target.__TAURI_IPC__ || target.__TAURI_INTERNALS__ || target.__TAURI_METADATA__);

const userAgentIndicatesTauri = () =>
  typeof navigator !== "undefined" && typeof navigator.userAgent === "string" && navigator.userAgent.toLowerCase().includes("tauri");

const hasEnvFlag = () => {
  try {
    const env = (import.meta as any)?.env;
    return Boolean(env?.TAURI_PLATFORM || env?.TAURI_ARCH || env?.TAURI_FAMILY);
  } catch {
    return false;
  }
};

export const isDesktopEnvironment = (): boolean => {
  if (!hasWindow) return false;
  const win = window as any;
  if (getTestHarness()?.invoke) return true;
  if (win.__LOOPAUTOMA_FORCE_DESKTOP__) return true;
  if (hasTauriGlobals(win)) return true;
  if (userAgentIndicatesTauri()) return true;
  if (hasEnvFlag()) return true;
  const protocol = win.location?.protocol;
  if (typeof protocol === "string" && protocol.startsWith("tauri")) return true;
  return false;
};
