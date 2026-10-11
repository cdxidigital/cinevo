import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Server } from "lucide-react";
import { connectionKind, plexAuthUrl, plexClientId, type PlexSection, type PlexServer } from "@/lib/plex";
import { plexImportSections, plexListServers, plexOpenServer, plexPollPin, plexStartPin } from "@/lib/plex-api";
import { remoteTitle } from "@/lib/library";
import { useCinevo } from "@/lib/cinevo-store";

type Opened = {
  server: PlexServer;
  uri: string;
  kind: string;
  sections: PlexSection[];
};

export function PlexConnect() {
  const plexToken = useCinevo((s) => s.plexToken);
  const plexUser = useCinevo((s) => s.plexUser);
  const plexServers = useCinevo((s) => s.plexServers);
  const plexClient = useCinevo((s) => s.plexClientId);
  const setPlexSession = useCinevo((s) => s.setPlexSession);
  const setPlexServers = useCinevo((s) => s.setPlexServers);
  const clearPlexSession = useCinevo((s) => s.clearPlexSession);
  const addRemoteTitles = useCinevo((s) => s.addRemoteTitles);

  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [pin, setPin] = useState<{ id: number; code: string } | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [manualUrl, setManualUrl] = useState("http://127.0.0.1:32400");
  const [manualToken, setManualToken] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const clientId = () => {
    const existing = plexClient || plexClientId();
    if (!plexClient && existing) useCinevo.setState({ plexClientId: existing });
    return existing;
  };

  const refreshServers = async (token = plexToken, user = plexUser) => {
    if (!token) return;
    setPending(true);
    try {
      const res = await plexListServers({ data: { clientId: clientId(), token } });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setPlexSession(token, res.username || user, res.servers, clientId());
      setPlexServers(res.servers);
      setMessage(
        res.servers.length
          ? `${res.servers.length} Plex ${res.servers.length === 1 ? "server" : "servers"} on this account.`
          : "Signed in, but no media servers are sharing with this Plex account yet.",
      );
    } finally {
      setPending(false);
    }
  };

  const startSignIn = async () => {
    setPending(true);
    setMessage("");
    try {
      const res = await plexStartPin({ data: { clientId: clientId() } });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setPin({ id: res.id, code: res.code });
      const url = plexAuthUrl(clientId(), res.code, window.location.href);
      const popup = window.open(url, "cinevo-plex", "popup,width=560,height=760");
      if (!popup) setMessage("The Plex window was blocked. Use the approval link below.");
      if (pollRef.current) window.clearInterval(pollRef.current);
      const started = Date.now();
      pollRef.current = window.setInterval(() => {
        void (async () => {
          if (Date.now() - started > 120_000) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            setPin(null);
            setMessage("Plex sign-in timed out. Try again.");
            return;
          }
          const poll = await plexPollPin({ data: { clientId: clientId(), pinId: res.id } });
          if (!poll.ok) return;
          if (!poll.token) return;
          if (pollRef.current) window.clearInterval(pollRef.current);
          setPin(null);
          await refreshServers(poll.token, "");
        })();
      }, 1600);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not start Plex sign-in.";
      setMessage(text === "Unauthorized" ? "Sign in to CINEVO first. Plex connects to your house." : text);
    } finally {
      setPending(false);
    }
  };

  const openServer = async (server: PlexServer) => {
    if (!plexToken) return;
    setPending(true);
    setMessage(`Reaching ${server.name}…`);
    try {
      const res = await plexOpenServer({
        data: { clientId: clientId(), token: server.accessToken || plexToken, server },
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      setOpened({ server, uri: res.uri, kind: res.kind, sections: res.sections });
      setPicked(res.sections.map((s) => s.key));
      setMessage(
        res.sections.length
          ? `Connected to ${server.name} over ${res.kind}. Choose libraries to index.`
          : `${server.name} is online, but it has no libraries yet.`,
      );
    } finally {
      setPending(false);
    }
  };

  const importPicked = async () => {
    if (!opened || !picked.length) return;
    setPending(true);
    try {
      const token = opened.server.accessToken || plexToken;
      const res = await plexImportSections({
        data: {
          clientId: clientId(),
          token,
          uri: opened.uri,
          sourceLabel: opened.server.name,
          sectionKeys: picked,
        },
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      const titles = res.titles.map((t) =>
        remoteTitle({
          id: t.id,
          title: t.title,
          year: t.year,
          kind: t.kind === "series" ? "series" : "movie",
          synopsis: t.synopsis,
          source: "plex",
          sourceLabel: opened.server.name,
          genre: t.genre,
          genres: t.genres,
          runtime: t.runtime,
          rating: t.rating,
          cast: t.cast,
          director: t.director,
          studio: t.studio,
          contentRating: t.contentRating,
          writers: t.writers,
          path: t.ratingKey || t.id.replace(/^plex-/, ""),
          folder: t.folder,
        }),
      );
      addRemoteTitles(titles, {
        id: `plex-${opened.server.id}`,
        kind: "plex",
        name: opened.server.name,
        baseUrl: opened.uri,
        accessToken: token,
        selected: true,
        count: titles.length,
        folders: res.folders,
      });
      setOpened(null);
      setMessage(`Imported ${titles.length} titles from ${opened.server.name}. CINEVO will proxy playback.`);
    } finally {
      setPending(false);
    }
  };

  const connectManual = async () => {
    const token = manualToken.trim() || plexToken;
    if (!token) {
      setMessage("Paste a Plex token, or sign in first.");
      return;
    }
    const server: PlexServer = {
      id: `manual-${hash(manualUrl)}`,
      name: "Plex (manual)",
      owned: true,
      productVersion: "",
      platform: "",
      accessToken: token,
      publicAddress: "",
      presence: true,
      connections: [{ uri: manualUrl.replace(/\/$/, ""), local: true, relay: false, protocol: manualUrl.startsWith("https") ? "https" : "http", address: "", port: 32400 }],
    };
    await openServer(server);
  };

  const owned = plexServers.filter((s) => s.owned);
  const shared = plexServers.filter((s) => !s.owned);

  return (
    <article className="glass rounded-xl p-4">
      <Server className="text-cine-cyan" size={20} />
      <h3 className="mt-3 font-ui text-lg font-semibold tracking-tight">Plex</h3>
      <p className="mt-1 text-sm text-cine-faint">
        Sign in with Plex to see every server on the account — home, shared, remote. Away from home, Plex Remote Access must be on.
      </p>

      {plexToken ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-cine-text">
            Signed in as <b>{plexUser || "Plex"}</b>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refreshServers()}
              disabled={pending}
              className="h-11 rounded-md border border-cine-border px-3 font-ui text-sm"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                clearPlexSession();
                setOpened(null);
                setMessage("Signed out of Plex.");
              }}
              className="h-11 rounded-md border border-cine-border px-3 font-ui text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void startSignIn()}
          disabled={pending}
          className="mt-3 h-11 w-full rounded-md bg-cine-cyan font-ui font-bold text-cine-bg"
        >
          {pending ? <LoaderCircle className="mx-auto animate-spin" size={16} /> : "Sign in with Plex"}
        </button>
      )}

      {pin ? (
        <div className="mt-3 rounded-md bg-cine-well px-3 py-3">
          <p className="font-ui text-xs font-medium uppercase tracking-[0.1em] text-cine-muted">Waiting for Plex</p>
          <p className="mt-2 text-sm text-cine-faint">
            Approve CINEVO in the Plex window. This is not a short code to type at plex.tv/link.
          </p>
          <a
            className="mt-3 inline-flex h-11 items-center font-ui text-sm font-bold text-cine-cyan"
            href={plexAuthUrl(clientId(), pin.code, typeof window !== "undefined" ? window.location.href : undefined)}
            target="_blank"
            rel="noreferrer"
          >
            Open Plex approval
          </a>
        </div>
      ) : null}

      {owned.length || shared.length ? (
        <div className="mt-4 space-y-3">
          {owned.length ? (
            <ServerGroup heading="Your servers" servers={owned} pending={pending} onOpen={openServer} />
          ) : null}
          {shared.length ? (
            <ServerGroup heading="Shared with you" servers={shared} pending={pending} onOpen={openServer} />
          ) : null}
        </div>
      ) : plexToken && !pending ? (
        <p className="mt-3 text-sm text-cine-faint">No servers yet. Refresh after Plex finishes sharing.</p>
      ) : null}

      {opened ? (
        <div className="mt-4 rounded-md bg-cine-well p-3">
          <p className="font-ui text-xs font-medium uppercase tracking-[0.1em] text-cine-cyan">
            {opened.server.name} · {opened.kind}
          </p>
          <div className="mt-3 space-y-2">
            {opened.sections.map((s) => (
              <label key={s.key} className="flex min-h-11 items-center justify-between gap-3">
                <span className="font-ui">
                  {s.title}
                  {s.type ? <span className="ml-2 text-xs text-cine-faint">{s.type}</span> : null}
                </span>
                <input
                  type="checkbox"
                  className="size-5 accent-cine-cyan"
                  checked={picked.includes(s.key)}
                  onChange={(e) =>
                    setPicked((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((k) => k !== s.key)))
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void importPicked()}
            disabled={pending || !picked.length}
            className="mt-3 h-11 w-full rounded-md bg-cine-cyan font-ui font-bold text-cine-bg"
          >
            Add selected to CINEVO
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="mt-4 text-left text-sm text-cine-faint hover:text-cine-text"
        onClick={() => setAdvanced((v) => !v)}
      >
        {advanced ? "Hide manual connection" : "Connect with a URL and token"}
      </button>
      {advanced ? (
        <div className="mt-2 space-y-2">
          <input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            aria-label="Plex server address"
            className="h-11 w-full rounded-md border border-cine-border bg-cine-well px-3 font-mono text-sm"
          />
          <input
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="X-Plex-Token"
            aria-label="Plex token"
            className="h-11 w-full rounded-md border border-cine-border bg-cine-well px-3 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => void connectManual()}
            disabled={pending}
            className="h-11 w-full rounded-md border border-cine-cyan font-ui font-bold text-cine-cyan"
          >
            Connect this address
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-sm text-cine-cyan">{message}</p> : null}
    </article>
  );
}

function ServerGroup({
  heading,
  servers,
  pending,
  onOpen,
}: {
  heading: string;
  servers: PlexServer[];
  pending: boolean;
  onOpen: (server: PlexServer) => void;
}) {
  return (
    <div>
      <p className="font-ui text-xs font-medium uppercase tracking-[0.1em] text-cine-muted">{heading}</p>
      <ul className="mt-2 space-y-2">
        {servers.map((server) => {
          const kinds = [...new Set(server.connections.map((c) => connectionKind(c)))];
          return (
            <li key={server.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onOpen(server)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md bg-cine-well px-3 text-left"
              >
                <span>
                  <b className="font-ui">{server.name}</b>
                  <span className="ml-2 text-xs text-cine-faint">
                    {server.owned ? "Owned" : "Shared"}
                    {kinds.length ? ` · ${kinds.join(" / ")}` : ""}
                    {server.presence ? "" : " · Offline"}
                  </span>
                </span>
                <span className="font-ui text-xs font-semibold uppercase tracking-wider text-cine-cyan">View</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
