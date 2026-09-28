// Cloudflare Workers entry point.
// Bridges the Express app to the Workers fetch() API via httpServerHandler.
// server.js is unchanged — local dev still works via `node server.js`.

import { httpServerHandler } from "cloudflare:node";
import app from "./server.js";

// In Workers, app.listen() does not open a real TCP port.
// The port number is a routing key that must match the httpServerHandler call below.
app.listen(4000);

const handler = httpServerHandler({ port: 4000 });

// Cloudflare Cron Triggers — replaces node-cron.
// Each cron expression matches a trigger defined in wrangler.toml [triggers].
async function scheduled(event) {
    switch (event.cron) {
        case "0 0 * * *": {
            const { runDailyDeliveryJob } = await import("./services/scheduler.js");
            const { runDailyManifestGenerationJob } = await import("./services/manifestService.js");
            await runDailyDeliveryJob();
            await runDailyManifestGenerationJob();
            break;
        }
        case "0 21 * * *": {
            const { runEndOfDayJob } = await import("./services/scheduler.js");
            await runEndOfDayJob();
            break;
        }
        case "0 1 1 * *": {
            const { generateBulkInvoices, markOverdueInvoices } = await import("./services/invoiceService.js");
            const now = new Date();
            let month = now.getMonth(); // 0-indexed current = 1-indexed previous month
            let year = now.getFullYear();
            if (month === 0) { month = 12; year -= 1; }
            await markOverdueInvoices();
            await generateBulkInvoices(month, year, { generatedBy: "system" });
            break;
        }
        default:
            console.warn(`[scheduled] Unknown cron expression: ${event.cron}`);
    }
}

export default { fetch: handler.fetch, scheduled };
