import { Router } from "express";
import { createMatchSchema } from "../validation/matches.js";
import { getMatchStatus } from "../utils/match-status.js";
import { prisma } from "../db.js";

export const matchRouter = Router();

matchRouter.get("/", (req, res) => {
  res.status(200).json({ message: "Matches List" });
});

matchRouter.post("/", async (req, res) => {
  const parsed = createMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: JSON.stringify(parsed.error),
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

    res.status(201).json({ data: event });
  } catch (e) {
    res
      .status(500)
      .json({ error: "Failed to create match.", details: JSON.stringify(e) });
  }
});
