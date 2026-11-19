import { Prisma } from "@prisma/client";
import { json, Router } from "express";
import { prisma } from "../db.js";
import { createHttpLimiter, protectMatchReads, requireMatchWriteToken } from "../security.js";
import { createCommentarySchema, listCommentaryQuerySchema } from "../validation/commentary.js";
import { matchIdParamSchema } from "../validation/matches.js";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

commentaryRouter.get("/", protectMatchReads, async (req, res) => {
  const params = matchIdParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({
      error: "Invalid match ID",
      details: params.error.issues,
    });
  }

  const query = listCommentaryQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({
      error: "Invalid query",
      details: query.error.issues,
    });
  }

  const limit = Math.min(query.data.limit ?? MAX_LIMIT, MAX_LIMIT);

  try {
    const data = await prisma.commentary.findMany({
      where: { matchId: params.data.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });

    res.json({ data });
  } catch {
    res.status(500).json({ error: "Failed to list commentary." });
  }
});

commentaryRouter.post(
  "/",
  createHttpLimiter(60_000, 10),
  requireMatchWriteToken(process.env.MATCH_WRITE_TOKEN, "Commentary creation is disabled."),
  json({ limit: "16kb", inflate: false }),
  async (req, res) => {
    const params = matchIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({
        error: "Invalid match ID",
        details: params.error.issues,
      });
    }

    const body = createCommentarySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: "Invalid payload",
        details: body.error.issues,
      });
    }

    const { metadata, ...commentary } = body.data;

    try {
      const data = await prisma.commentary.create({
        data: {
          ...commentary,
          match: { connect: { id: params.data.id } },
          metadata: metadata === null ? Prisma.DbNull : metadata,
        },
      });
      res.status(201).json({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025" || error.code === "P2003") {
          return res.status(404).json({ error: "Match not found." });
        }
        if (error.code === "P2002") {
          return res.status(409).json({ error: "Commentary sequence already exists for this match." });
        }
      }
      res.status(500).json({ error: "Failed to create commentary." });
    }
  },
);
