import { json, Router } from "express";
import {
  createMatchSchema,
  listMatchesQuerySchema,
} from "../validation/matches.js";
import { getMatchStatus } from "../utils/match-status.js";
import { prisma } from "../db.js";
import { createHttpLimiter, protectMatchReads, requireMatchWriteToken } from "../security.js";

export const matchRouter = Router();

const MAX_LIMIT = 100;

matchRouter.get("/", protectMatchReads, async (req, res) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid query",
      details: parsed.error.issues,
    });
  }

  const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

  try {
    const data = await prisma.match.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: "Failed to list matches." });
  }
});

matchRouter.post(
  "/",
  createHttpLimiter(60_000, 10),
  requireMatchWriteToken(process.env.MATCH_WRITE_TOKEN),
  json({ limit: "16kb", inflate: false }),
  async (req, res) => {
    const parsed = createMatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid payload",
        details: parsed.error.issues,
      });
    }

    const { startTime, endTime, homeScore, awayScore } = parsed.data;
    const status = getMatchStatus(startTime, endTime);

    if (status === null) {
      return res.status(400).json({ error: "Invalid match dates" });
    }

    try {
      const event = await prisma.match.create({
        data: {
          ...parsed.data,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          homeScore: homeScore ?? 0,
          awayScore: awayScore ?? 0,
          status,
        },
      });
      if (res.app.locals.broadcastMatchCreated) {
        res.app.locals.broadcastMatchCreated(event);
      }

      res.status(201).json({ data: event });
    } catch {
      res.status(500).json({ error: "Failed to create match." });
    }
  },
);
