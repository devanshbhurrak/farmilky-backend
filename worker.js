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
// Jobs run independently: a failure in one does not prevent the others from executing.
async function scheduled(event, env, ctx) {
    switch (event.cron) {
        case "0 0 * * *": {
            const { runDailyDeliveryJob } = await import("./services/scheduler.js");
            const { runDailyManifestGenerationJob } = await import("./services/manifestService.js");
            try {
                await runDailyDeliveryJob();
            } catch (err) {
                console.error("[cron] Daily delivery job failed:", err);
            }
            try {
                await runDailyManifestGenerationJob();
            } catch (err) {
                console.error("[cron] Daily manifest generation failed:", err);
            }
            break;
        }
        case "0 21 * * *": {
            const { runEndOfDayJob } = await import("./services/scheduler.js");
            try {
                await runEndOfDayJob();
            } catch (err) {
                console.error("[cron] End-of-day job failed:", err);
            }
            break;
        }
        case "0 1 1 * *": {
            // markOverdueInvoices and generateBulkInvoices share one try/catch,
            // preserving original scheduler semantics: if markOverdueInvoices fails,
            // generateBulkInvoices does not execute for that run.
            try {
                const { generateBulkInvoices, markOverdueInvoices } = await import("./services/invoiceService.js");
                const now = new Date();
                let month = now.getMonth(); // 0-indexed current = 1-indexed previous month
                let year = now.getFullYear();
                if (month === 0) { month = 12; year -= 1; }
                await markOverdueInvoices();
                await generateBulkInvoices(month, year, { generatedBy: "system" });
            } catch (err) {
                console.error("[cron] Monthly invoice job failed:", err);
            }
            break;
        }
        default:
            console.warn(`[scheduled] Unknown cron expression: ${event.cron}`);
    }
}

export default { fetch: handler.fetch, scheduled };
