// Cloudflare Workers entry point.
// Imports the Express app from server.js and hands it to httpServerHandler,
// which bridges Node.js http.Server semantics to the Workers fetch() API.
// server.js is unchanged — local dev still works via `node server.js`.

import { httpServerHandler } from "cloudflare:node";
import app from "./server.js";

// In Workers, app.listen() does not open a real TCP port.
// The port number is a routing key that must match the httpServerHandler call below.
app.listen(4000);

export default httpServerHandler({ port: 4000 });
