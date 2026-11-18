import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { prisma } from "./db.js";
import http from "http";
import { matchRouter } from "./routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";
import { createHttpLimiter } from "./security.js";

const app = express();
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";

app.use(helmet());
app.use(createHttpLimiter(10_000, 50));
const server = http.createServer({ headersTimeout: 10_000, requestTimeout: 30_000 }, app);

app.get("/", (req, res) => {
  res.send("Hello from Express!");
});

app.use("/matches", matchRouter);

const handleRequestError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status = error.status;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    res.status(status).json({ error: http.STATUS_CODES[status] });
    return;
  }
  console.error("Unexpected HTTP request error.");
  res.status(500).json({ error: "Internal Server Error" });
};
app.use(handleRequestError);

const allowedOrigins = new Set(
  process.env.WS_ALLOWED_ORIGINS?.split(",").map(origin => origin.trim()).filter(Boolean),
);
const { broadcastMatchCreated } = attachWebSocketServer(server, allowedOrigins);
app.locals.broadcastMatchCreated = broadcastMatchCreated;

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Connected to Neon database.");

  server.listen(PORT, HOST, () => {
    const baseUrl =
      HOST === "0.0.0.0"
        ? `http://localhost:${PORT}`
        : `http://${HOST}:${PORT}`;
    console.log(`Server running at ${baseUrl}`);
    console.log(
      `WebSocket Server is running on ${baseUrl.replace("http", "ws")}/ws`,
    );
  });
} catch {
  console.error(
    "Could not connect to Neon. Check DATABASE_URL and your network connection.",
  );
  await prisma.$disconnect();
  process.exitCode = 1;
}
