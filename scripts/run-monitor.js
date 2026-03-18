const path = require("path");

const { loadEnv } = require("../src/lib/env");
const { runMonitorCycle } = require("../src/lib/monitor-runner");

const rootDir = path.resolve(__dirname, "..");
loadEnv(rootDir);

(async () => {
  const result = await runMonitorCycle(rootDir, {
    sendAlerts: true,
    writeDashboardFile: true,
  });

  console.log(
    JSON.stringify(
      {
        walletAddress: result.config.walletAddress,
        lastRefreshAt: result.lastRefreshAt,
        totalItems: result.items.length,
        enabledItems: result.items.filter((item) => item.enabled).length,
        undercutItems: result.items.filter((item) => item.cheaperCompetitor).length,
        sentAlertsInLastRefresh: result.sentAlertsInLastRefresh,
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
