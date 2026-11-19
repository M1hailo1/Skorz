import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { isbot } from "isbot";

export function isBlockedBot(userAgent: string | undefined, allowPublicBots = false) {
  const publicBot = /\b(?:Googlebot|bingbot|DuckDuckBot|Applebot|facebookexternalhit|Twitterbot|Slackbot-LinkExpanding|Discordbot|LinkedInBot)\b/i;
  return isbot(userAgent) && !(allowPublicBots && publicBot.test(userAgent ?? ""));
}

export const protectMatchReads: RequestHandler = (req, res, next) => {
  if (isBlockedBot(req.get("user-agent"), true)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }
  next();
};

export function createHttpLimiter(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests." },
  });
}

const digest = (value: string) => createHash("sha256").update(value).digest();

export function requireMatchWriteToken(
  token: string | undefined,
  disabledMessage = "Match creation is disabled.",
): RequestHandler {
  const expected = token && digest(token);
  return (req, res, next) => {
    if (!expected) {
      res.status(403).json({ error: disabledMessage });
      return;
    }

    const provided = /^Bearer ([^\s]+)$/i.exec(req.get("authorization") ?? "")?.[1];
    if (!provided || !timingSafeEqual(digest(provided), expected)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.status(401).json({ error: "A valid match write token is required." });
      return;
    }
    next();
  };
}
