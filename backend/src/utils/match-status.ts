import { MATCH_STATUS } from "../validation/matches.js";

type MatchStatus = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

type MatchTiming = {
  startTime: string | Date;
  endTime: string | Date | null;
  status: MatchStatus;
};

export function getMatchStatus(
  startTime: string | Date,
  endTime: string | Date | null,
  now: Date = new Date(),
): MatchStatus | null {
  if (endTime === null) {
    return null;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  if (now < start) {
    return MATCH_STATUS.SCHEDULED;
  }

  if (now >= end) {
    return MATCH_STATUS.FINISHED;
  }

  return MATCH_STATUS.LIVE;
}

export async function syncMatchStatus(
  match: MatchTiming,
  updateStatus: (status: MatchStatus) => unknown | Promise<unknown>,
): Promise<MatchStatus> {
  const nextStatus = getMatchStatus(match.startTime, match.endTime);
  if (!nextStatus) {
    return match.status;
  }
  if (match.status !== nextStatus) {
    await updateStatus(nextStatus);
    match.status = nextStatus;
  }
  return match.status;
}
