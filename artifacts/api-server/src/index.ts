import { createServer } from "http";
import app from "./app.js";
import { setupWebSocketServer } from "./lib/wsManager.js";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
setupWebSocketServer(server);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
