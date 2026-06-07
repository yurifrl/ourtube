/**
 * Server entry point
 */
import { initApi, shutdown } from "./api";

// Handle graceful shutdown
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start
initApi();
