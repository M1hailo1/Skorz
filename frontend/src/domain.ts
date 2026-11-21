export interface Match {
  id: number;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  status: "scheduled" | "live" | "finished";
  startTime: string;
  endTime: string | null;
  homeScore: number;
  awayScore: number;
  competition?: string;
  minute?: number;
}

export interface Commentary {
  id: number;
  matchId: number;
  minute: number | null;
  sequence: number;
  eventType: string | null;
  message: string;
  createdAt: string;
}

export function dateKey(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
}

export function dayAt(offset: number) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return day;
}

export function matchStatus(match: Match, now: number) {
  if (match.endTime === null) return match.status;
  if (now >= Date.parse(match.endTime)) return "finished";
  if (now < Date.parse(match.startTime)) return "scheduled";
  return "live";
}

export function upsert<T extends { id: number }>(items: T[], incoming: T[]) {
  const byId = new Map(items.map(item => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
