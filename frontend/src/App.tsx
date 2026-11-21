import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bookmark, CalendarDays, ChevronLeft, ChevronRight, CircleDot, Dribbble, Goal, LayoutList, Radio, Search, Trophy, Volleyball, X } from "lucide-react";
import { Featured, MatchPanel, MatchRow } from "./components";
import { demoCommentary, demoMatches } from "./demo";
import { dateKey, dayAt, matchStatus, upsert, type Match } from "./domain";
import { useFeed } from "./feed";

type View = "scores" | "live" | "saved";
type Mode = "demo" | "api";

function getMode(): Mode {
  const source = new URLSearchParams(location.search).get("source");
  if (source === "api" || source === "demo") return source;
  return import.meta.env.VITE_DATA_SOURCE === "api" ? "api" : "demo";
}

function loadSaved(mode: Mode): number[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(`skorz.saved.${mode}`) ?? "[]");
    return Array.isArray(list) ? list.filter(id => Number.isInteger(id)) : [];
  } catch { return []; }
}

const sportIcons: Record<string, typeof Trophy> = { Football: Goal, Basketball: Dribbble, Tennis: Volleyball };
const views = [
  { id: "scores", label: "Scores", Icon: LayoutList },
  { id: "live", label: "Live", Icon: Radio },
  { id: "saved", label: "Saved", Icon: Bookmark },
] as const;

function sportName(value: string) {
  const sport = value.trim().toLowerCase();
  if (sport === "soccer") return "Football";
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

function groupMatches(matches: Match[]) {
  const groups = new Map<string, { label: string; sport: string; matches: Match[] }>();
  for (const match of matches) {
    const label = match.competition ?? match.sport;
    const key = `${match.sport}:${label}`;
    const group = groups.get(key);
    if (group) group.matches.push(match);
    else groups.set(key, { label, sport: match.sport, matches: [match] });
  }
  return [...groups.values()];
}

export function App() {
  const [mode, setMode] = useState<Mode>(getMode);
  useEffect(() => {
    const syncMode = () => setMode(getMode());
    window.addEventListener("popstate", syncMode);
    return () => window.removeEventListener("popstate", syncMode);
  }, []);
  function changeMode(next: Mode) {
    const url = new URL(location.href);
    url.searchParams.set("source", next);
    history.pushState(null, "", url);
    setMode(next);
  }
  return <MatchCentre key={mode} mode={mode} onModeChange={changeMode} />;
}

function MatchCentre({ mode, onModeChange }: { mode: Mode; onModeChange: (mode: Mode) => void }) {
  const isDemo = mode === "demo";
  const [view, setView] = useState<View>("scores");
  const [offset, setOffset] = useState(0);
  const [sport, setSport] = useState("All sports");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(() => loadSaved(mode));
  const [selected, setSelected] = useState<number | null>(isDemo ? 1 : null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const feed = useFeed(!isDemo, selected);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(`skorz.saved.${mode}`, JSON.stringify(saved)); } catch { /* Storage is optional. */ }
  }, [mode, saved]);

  const matches = useMemo(() => (isDemo ? demoMatches : feed.matches).map(match => ({
    ...match, sport: sportName(match.sport), status: isDemo ? match.status : matchStatus(match, now),
  })), [isDemo, feed.matches, now]);
  const date = dayAt(offset);
  const currentDay = dateKey(date);
  const todays = matches.filter(match => dateKey(new Date(match.startTime)) === currentDay);
  const searchTerm = query.trim().toLowerCase();
  const base = view === "saved" ? matches.filter(match => saved.includes(match.id))
    : view === "live" ? matches.filter(match => match.status === "live") : searchTerm ? matches : todays;
  const filtered = base.filter(match =>
    (sport === "All sports" || match.sport === sport)
    && (!searchTerm || [match.homeTeam, match.awayTeam, match.competition, match.sport].some(
      text => text?.toLowerCase().includes(searchTerm),
    )),
  );
  const sports = [...new Set(matches.map(match => match.sport))];
  const sportOptions = ["All sports", ...sports];
  const liveCount = matches.filter(match => match.status === "live").length;
  const featured = todays.find(match => match.status === "live") ?? todays[0];
  const showFeatured = featured && view === "scores" && offset === 0 && !searchTerm && sport === "All sports";
  const active = matches.find(match => match.id === selected);
  const history = feed.history?.matchId === selected ? feed.history : null;
  const events = isDemo ? demoCommentary.filter(entry => entry.matchId === selected)
    : upsert(history?.entries ?? [], feed.events.filter(entry => entry.matchId === selected));
  const orderedEvents = [...events].sort((a, b) => b.sequence - a.sequence || b.id - a.id);

  function selectMatch(id: number) {
    setSelected(id);
    setDetailOpen(true);
  }
  function enterView(next: View) {
    setView(next);
    setSport("All sports");
    setQuery("");
  }

  useEffect(() => {
    const element = dialog.current;
    const mobile = window.matchMedia("(max-width: 900px)");
    function sync() {
      if (detailOpen && active && mobile.matches && element && !element.open) element.showModal();
      if ((!detailOpen || !active || !mobile.matches) && element?.open) element.close();
    }
    sync();
    mobile.addEventListener("change", sync);
    return () => mobile.removeEventListener("change", sync);
  }, [active?.id, detailOpen]);

  const panel = active ? {
    match: active, events: orderedEvents, loading: !isDemo && history === null && events.length === 0,
    error: history?.error, onRetry: feed.refresh,
  } : null;

  let empty = view === "saved" ? "No saved matches yet." : view === "live" ? "No live matches in this view." : "No matches scheduled for this day.";
  if (query || sport !== "All sports") empty = "No matches match your filters.";

  return <div className="app">
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href={`?source=${mode}`} aria-label="Skorz home"><span><Activity size={20} strokeWidth={2.7} /></span>skorz<span className="brand-period">.</span></a>
        <nav aria-label="Main navigation" className="main-nav">
          {views.map(({ id, label, Icon }) => <button key={id} className={view === id ? "nav-item current" : "nav-item"} aria-current={view === id ? "page" : undefined} onClick={() => enterView(id)}>
            <Icon size={16} />{label}{id === "live" && liveCount > 0 && <span className="nav-count">{liveCount}</span>}
          </button>)}
        </nav>
        <div className="source-control">
          {isDemo ? <span className="source-label">Demo data</span> : <span className={`source-label ${feed.connection}`} aria-live="polite"><span className="status-dot" />{feed.connection === "connected" ? "API connected" : feed.connection === "connecting" ? "Connecting" : "Reconnecting"}</span>}
          <button className="source-switch" onClick={() => onModeChange(isDemo ? "api" : "demo")}>{isDemo ? "Connect API" : "Use demo"}</button>
        </div>
      </div>
    </header>
    <main className="shell">
      <section className="page-heading">
        <div><h1>{view === "saved" ? "Saved matches" : view === "live" ? "Live matches" : "Matchday"}</h1>
          <p>{view === "scores" ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : view === "live" ? `${liveCount} ${liveCount === 1 ? "match" : "matches"} in play` : `${saved.length} saved`}</p>
        </div>
        <div className="search-box">
          <Search size={18} aria-hidden="true" />
          <input ref={search} aria-label="Search matches" placeholder="Search matches" value={query} onChange={event => setQuery(event.target.value)} />
          {query && <button className="icon-button" aria-label="Clear search" onClick={() => { setQuery(""); search.current?.focus(); }}><X size={16} /></button>}
        </div>
      </section>
      {showFeatured && <Featured match={featured} onOpen={() => selectMatch(featured.id)} photo={isDemo && featured.id === 1} />}
      <div className="content-grid">
        <section className="fixtures" aria-label="Fixtures">
          <div className="list-heading"><h2>{view === "scores" ? "Fixtures" : view === "saved" ? "Your list" : "In play"}</h2><span>{filtered.length} {filtered.length === 1 ? "match" : "matches"}</span></div>
          {view === "scores" && !searchTerm && <div className="date-strip" aria-label="Choose match date">
            <button className="icon-button" onClick={() => setOffset(value => value - 1)} aria-label="Previous day"><ChevronLeft size={19} /></button>
            <div className="date-options">
              {[offset - 2, offset - 1, offset, offset + 1, offset + 2].map(value => {
                const day = dayAt(value);
                return <button key={value} className={value === offset ? "date-option active" : "date-option"} aria-pressed={value === offset} onClick={() => setOffset(value)}>
                  <span>{value === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong>
                </button>;
              })}
            </div>
            <button className="icon-button" onClick={() => setOffset(value => value + 1)} aria-label="Next day"><ChevronRight size={19} /></button>
          </div>}
          <div className="sport-filters" aria-label="Filter by sport">
            {sportOptions.map(label => {
              const Icon = sportIcons[label] ?? (label === "All sports" ? LayoutList : Trophy);
              return <button key={label} className={sport === label ? "sport-filter active" : "sport-filter"} aria-pressed={sport === label} onClick={() => setSport(label)}><Icon size={15} />{label}</button>;
            })}
          </div>
          {!isDemo && feed.matchError && <div className="empty" role="status"><strong>Couldn’t load matches</strong><p>Check that the Skorz API is running.</p><button className="light-button" onClick={feed.refresh}>Try again</button></div>}
          {!isDemo && !feed.ready && <div className="empty" role="status">Loading fixtures…</div>}
          {(isDemo || (feed.ready && !feed.matchError)) && filtered.length === 0 && <div className="empty"><CalendarDays size={22} /><p>{empty}</p></div>}
          {groupMatches(filtered).map(group => {
            const Icon = sportIcons[group.sport] ?? Trophy;
            return <section className="league" key={`${group.sport}:${group.label}`}>
              <h3><span><Icon size={16} /></span>{group.label}</h3>
              {group.matches.map(match => <MatchRow key={match.id} match={match} selected={selected === match.id} saved={saved.includes(match.id)} onOpen={() => selectMatch(match.id)} onSave={() => setSaved(items => items.includes(match.id) ? items.filter(id => id !== match.id) : [...items, match.id])} />)}
            </section>;
          })}
        </section>
        <aside className="desktop-panel" aria-label="Selected match">
          {panel ? <MatchPanel {...panel} onClose={() => setSelected(null)} /> : <div className="panel-placeholder"><CircleDot size={24} /><h2>Match centre</h2><p>Select a match to see its score and commentary.</p></div>}
        </aside>
      </div>
    </main>
    <dialog ref={dialog} className="mobile-panel" aria-label="Match centre" onClose={() => {
      setDetailOpen(false);
      if (window.matchMedia("(max-width: 900px)").matches) setSelected(null);
    }} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      {panel && <div className="sheet-content"><MatchPanel {...panel} onClose={() => dialog.current?.close()} /></div>}
    </dialog>
  </div>;
}
