require("dotenv").config();
const app = require("./src/app");
const pool = require("./src/config/db");

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

/**
 * In the container node runs as PID 1, and PID 1 only reacts to a signal it has
 * a handler for. Without this `docker stop` waits out its ten second grace
 * period and then SIGKILLs, cutting off requests that were still in flight.
 */
const shutdown = (signal) => () => {
  console.log(`${signal} received, shutting down`);

  server.close(async () => {
    await pool.end().catch((error) => console.error(error));
    process.exit(0);
  });

  // A stuck connection must not hold the deploy hostage.
  setTimeout(() => process.exit(1), 8000).unref();
};

process.on("SIGTERM", shutdown("SIGTERM"));
process.on("SIGINT", shutdown("SIGINT"));
