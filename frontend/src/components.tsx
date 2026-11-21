import { Bookmark, ChevronRight, CircleDot, Flag, Goal, Radio, Square, Volleyball, X } from "lucide-react";
import { timeLabel, type Commentary, type Match } from "./domain";

const colors = ["#815ef3", "#ed775f", "#5a9dee", "#42ba9c", "#dfb557", "#e77aa7"];
const clubColors: Record<string, string> = {
  "Northbridge FC": "#7989ff",
  "Riverside United": "#fa7158",
};

export function Crest({ name, large = false }: { name: string; large?: boolean }) {
  const words = name.split(/\s+/);
  const initials = words.length > 1 ? words.slice(0, 2).map(word => word[0]).join("") : name.slice(0, 2);
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const color = clubColors[name] ?? colors[hash % colors.length];
  return <span className={large ? "crest crest-large" : "crest"} style={{ color, backgroundColor: color + "24" }} aria-hidden="true">{initials}</span>;
}

function label(match: Match) {
  if (match.status === "live") return match.minute === undefined ? "LIVE" : `${match.minute}′`;
  if (match.status === "finished") return "FT";
  return timeLabel(match.startTime);
}

export function Featured({ match, onOpen, photo }: { match: Match; onOpen: () => void; photo: boolean }) {
  return <section className={`featured${photo ? " featured-photo" : ""}`} aria-label="Featured match">
    <div className="featured-body">
      <div className="featured-meta">
        {match.status === "live" ? <span className="live-pill"><Radio size={14} /> Live now</span> : <span className="feature-status">{label(match)}</span>}
        <span>{match.competition ?? match.sport}</span>
      </div>
      <h2>{match.homeTeam}<br />{match.awayTeam}</h2>
      <div className="featured-bottom">
        <span className="featured-score">{match.status === "scheduled" ? label(match) : `${match.homeScore} : ${match.awayScore}`}</span>
        <button className="light-button" onClick={onOpen}>Match details</button>
      </div>
    </div>
  </section>;
}

export function MatchRow({ match, selected, saved, onOpen, onSave }: {
  match: Match; selected: boolean; saved: boolean; onOpen: () => void; onSave: () => void;
}) {
  const showScore = match.status !== "scheduled";
  const name = `${match.homeTeam} vs ${match.awayTeam}`;
  return <div className={`match-row${selected ? " selected" : ""}`}>
    <button className="match-select" onClick={onOpen} aria-pressed={selected} aria-label={`${name}, ${label(match)}${showScore ? `, ${match.homeScore} to ${match.awayScore}` : ""}`}>
      <span className={`row-status ${match.status}`}>{label(match)}</span>
      <span className="row-teams">
        <span><Crest name={match.homeTeam} /><span>{match.homeTeam}</span></span>
        <span><Crest name={match.awayTeam} /><span>{match.awayTeam}</span></span>
      </span>
      <span className="row-score" aria-hidden="true">
        <span>{showScore ? match.homeScore : "–"}</span><span>{showScore ? match.awayScore : "–"}</span>
      </span>
      <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
    </button>
    <button className="icon-button bookmark" onClick={onSave} aria-pressed={saved} aria-label={`${saved ? "Remove bookmark for" : "Bookmark"} ${name}`}>
      <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
    </button>
  </div>;
}

function eventPresentation(event: Commentary) {
  switch (event.eventType?.toLowerCase()) {
    case "goal": return { name: "Goal", Icon: Goal, kind: "goal" };
    case "card":
    case "yellow_card": return { name: "Yellow card", Icon: Square, kind: "card" };
    case "red_card": return { name: "Red card", Icon: Square, kind: "red" };
    case "whistle": return { name: "Whistle", Icon: Flag, kind: "neutral" };
    case "score": return { name: "Score", Icon: Volleyball, kind: "goal" };
    case "chance": return { name: "Chance", Icon: CircleDot, kind: "neutral" };
    default: return { name: event.eventType?.replace(/[_-]/g, " ") || "Update", Icon: CircleDot, kind: "neutral" };
  }
}

export function MatchPanel({ match, events, loading, error, onRetry, onClose }: {
  match: Match; events: Commentary[]; loading: boolean; error?: string; onRetry: () => void; onClose: () => void;
}) {
  return <>
    <div className="panel-heading">
      <div><h2>Match centre</h2><p>{match.competition ?? match.sport}</p></div>
      <button className="icon-button close-panel" onClick={onClose} aria-label="Close match centre"><X size={21} /></button>
    </div>
    <section className="score-panel" aria-label="Match score">
      <div className="scoreboard">
        <div className="score-team"><Crest name={match.homeTeam} large /><strong>{match.homeTeam}</strong></div>
        <div className="score-middle">
          <strong>{match.status === "scheduled" ? "vs" : `${match.homeScore} : ${match.awayScore}`}</strong>
          <span className={`row-status ${match.status}`}>{match.status === "live" && <span className="status-dot" />}{label(match)}</span>
        </div>
        <div className="score-team"><Crest name={match.awayTeam} large /><strong>{match.awayTeam}</strong></div>
      </div>
    </section>
    <section className="commentary" aria-label="Match commentary">
      <div className="commentary-heading"><h3>Commentary</h3>{match.status === "live" && <span className="live-pill"><Radio size={13} /> Live</span>}</div>
      {loading && <p className="panel-message" role="status">Loading commentary…</p>}
      {error && <div className="panel-message" role="status">Commentary is unavailable. <button className="text-button" onClick={onRetry}>Retry</button></div>}
      {!loading && !error && events.length === 0 && <p className="panel-message">{match.status === "scheduled" ? "Commentary will appear here once updates arrive." : "No commentary has been posted for this match."}</p>}
      <ol className="timeline">
        {events.map(event => {
          const { name, Icon, kind } = eventPresentation(event);
          return <li key={event.id}>
            <span className={`event-icon ${kind}`}><Icon size={15} aria-hidden="true" /></span>
            <div><strong>{name}</strong><p>{event.message}</p></div>
            <time dateTime={event.createdAt}>{event.minute === null ? timeLabel(event.createdAt) : `${event.minute}′`}</time>
          </li>;
        })}
      </ol>
    </section>
  </>;
}
