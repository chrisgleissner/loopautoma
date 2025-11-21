import { FullConfig, WebServerConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig) {
  const isCI = !!process.env.CI;
  const workers = config.workers ?? 'default';
  const playwrightCoverage = process.env.PLAYWRIGHT_COVERAGE === '1';
  const viteCoverage = process.env.VITE_E2E_COVERAGE === '1';
  const debugChannels = process.env.DEBUG || 'none';

  const reporterNames = Array.isArray(config.reporter)
    ? config.reporter.map((entry) => (Array.isArray(entry) ? entry[0] : String(entry)))
    : [String(config.reporter)];

  const servers: WebServerConfig[] = Array.isArray(config.webServer)
    ? config.webServer
    : config.webServer
      ? [config.webServer]
      : [];

  console.log(
    `[e2e:setup] CI=${isCI} workers=${workers} coverage=${playwrightCoverage} vite_instrumentation=${viteCoverage}`,
  );
  console.log(`[e2e:setup] reporters=${reporterNames.join(', ')} debug_channels=${debugChannels}`);

  servers.forEach((server, index) => {
    const envKeys = server.env ? Object.keys(server.env) : [];
    console.log(
      `[e2e:setup] webServer#${index + 1} command="${server.command}" ` +
      `timeout=${server.timeout ?? 'default'} reuseExisting=${server.reuseExistingServer ?? false} ` +
      `envKeys=${envKeys.length ? envKeys.join(',') : 'none'}`,
    );
  });
}
