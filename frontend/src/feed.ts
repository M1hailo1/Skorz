import { useEffect, useReducer, useState } from "react";
import { upsert, type Commentary, type Match } from "./domain";

export type Connection = "connecting" | "connected" | "reconnecting";
type History = { matchId: number; entries: Commentary[]; error?: string };
type FeedEvent =
  | { type: "welcome" }
  | { type: "subscribed"; matchId: number }
  | { type: "match_created"; data: Match }
  | { type: "commentary"; data: Commentary };

async function read<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(path, { signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  const payload = await response.json() as { data: T[] };
  if (!Array.isArray(payload.data)) throw new Error("Unexpected API response.");
  return payload.data;
}

export function useFeed(enabled: boolean, matchId: number | null) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [events, setEvents] = useState<Commentary[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [matchError, setMatchError] = useState("");
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [revision, refresh] = useReducer(value => value + 1, 0);
  const [historyRevision, refreshHistory] = useReducer(value => value + 1, 0);
  const [generation, connected] = useReducer(value => value + 1, 0);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let current: WebSocket;
    let timer: number;
    let attempts = 0;

    function connect() {
      const url = new URL("/ws", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      current = new WebSocket(url);
      current.onmessage = ({ data }) => {
        if (!active) return;
        let event: FeedEvent;
        try { event = JSON.parse(data); } catch { return; }
        if (event.type === "welcome") {
          attempts = 0;
          setSocket(current);
          setConnection("connected");
          connected();
        }
        if (event.type === "match_created") setMatches(items => upsert(items, [event.data]));
        if (event.type === "subscribed") refreshHistory();
        if (event.type === "commentary") {
          setEvents(items => upsert(items, [event.data]).slice(-300));
        }
      };
      current.onclose = () => {
        if (!active) return;
        setSocket(null);
        setConnection("reconnecting");
        timer = window.setTimeout(connect, Math.min(2000 * 2 ** attempts++, 30000));
      };
    }

    connect();
    return () => {
      active = false;
      window.clearTimeout(timer);
      current.close();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !socket || socket.readyState !== WebSocket.OPEN || matchId === null) return;
    socket.send(JSON.stringify({ type: "subscribe", matchId }));
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "unsubscribe", matchId }));
      }
    };
  }, [enabled, socket, matchId]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    read<Match>("/matches?limit=100", controller.signal)
      .then(data => {
        setMatches(items => upsert(items, data).sort((a, b) => b.id - a.id).slice(0, 100));
        setMatchError("");
      })
      .catch(error => { if (!controller.signal.aborted) setMatchError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setReady(true); });
    return () => controller.abort();
  }, [enabled, generation, revision]);

  useEffect(() => {
    if (!enabled || matchId === null) return;
    const controller = new AbortController();
    read<Commentary>(`/matches/${matchId}/commentary`, controller.signal)
      .then(entries => setHistory({ matchId, entries }))
      .catch(error => {
        if (!controller.signal.aborted) setHistory(previous => ({
          matchId, entries: previous?.matchId === matchId ? previous.entries : [], error: error.message,
        }));
      });
    return () => controller.abort();
  }, [enabled, matchId, historyRevision, revision]);

  return { matches, events, history, matchError, ready, connection, refresh };
}
