import express from "express";
import { prisma } from "./db.js";
import http from "http";
import { matchRouter } from "./routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";

const app = express();
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";

app.use(express.json());
const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Hello from Express!");
});

app.use("/matches", matchRouter);

const { broadcastMatchCreated } = attachWebSocketServer(server);
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
