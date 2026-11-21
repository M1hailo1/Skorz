import { dayAt, type Commentary, type Match } from "./domain";

function fixture(
  id: number, competition: string, teams: [string, string], score: [number, number],
  status: Match["status"], hour: number, options: { day?: number; sport?: string; minute?: number } = {},
): Match {
  const start = dayAt(options.day ?? 0);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    id, competition, sport: options.sport ?? "Football",
    homeTeam: teams[0], awayTeam: teams[1], homeScore: score[0], awayScore: score[1],
    status, startTime: start.toISOString(), endTime: end.toISOString(), minute: options.minute,
  };
}

export const demoMatches = [
  fixture(1, "Premier Division", ["Northbridge FC", "Riverside United"], [2, 1], "live", 17, { minute: 68 }),
  fixture(2, "Premier Division", ["Eastfield City", "Westhaven FC"], [0, 0], "live", 17, { minute: 62 }),
  fixture(3, "Premier Division", ["Southbank Rovers", "Kingsport Town"], [0, 0], "scheduled", 20),
  fixture(4, "Continental Cup", ["Real Montara", "Atlético Vale"], [3, 2], "finished", 13),
  fixture(5, "Continental Cup", ["Union Porto", "AC Verona"], [0, 0], "scheduled", 21),
  fixture(6, "National League", ["Brooklyn Bolts", "Chicago Flight"], [91, 86], "live", 17, { sport: "Basketball" }),
  fixture(7, "National League", ["Seattle Summit", "Austin Heat"], [102, 97], "finished", 13, { sport: "Basketball" }),
  fixture(8, "Summer Open", ["Lena Novak", "Maya Brooks"], [2, 1], "finished", 14, { sport: "Tennis" }),
  fixture(9, "Premier Division", ["Westhaven FC", "Riverside United"], [1, 1], "finished", 18, { day: -1 }),
  fixture(10, "Continental Cup", ["AC Verona", "Real Montara"], [0, 0], "scheduled", 19, { day: 1 }),
  fixture(11, "National League", ["Chicago Flight", "Seattle Summit"], [0, 0], "scheduled", 21, { day: 1, sport: "Basketball" }),
];

function event(matchId: number, sequence: number, minute: number, eventType: string, message: string): Commentary {
  return { id: matchId * 100 + sequence, matchId, sequence, minute, eventType, message, createdAt: new Date().toISOString() };
}

export const demoCommentary = [
  event(1, 5, 68, "goal", "Northbridge take the lead. A low cross finds Cole at the far post and he finishes first time."),
  event(1, 4, 54, "card", "Riverside's Ben Foster goes into the book after a late challenge."),
  event(1, 3, 45, "whistle", "Half-time. The sides go in level after an even first half."),
  event(1, 2, 32, "goal", "Riverside equalise through a header from the corner."),
  event(1, 1, 19, "goal", "Northbridge score first. Cole drills it low into the bottom corner."),
  event(2, 1, 61, "chance", "Eastfield hit the post from just outside the area."),
  event(4, 1, 90, "whistle", "Full-time. Real Montara hold on to win by one."),
  event(6, 1, 38, "score", "Brooklyn extend their lead with a three from the corner."),
];
