import { useState } from "react";
import { HardDrive, LoaderCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { jellyfinConnect, jellyfinImportSections, jellyfinListSections } from "@/lib/jellyfin-api";
import { plexClientId } from "@/lib/plex";
import { remoteTitle } from "@/lib/library";
import { useCinevo } from "@/lib/cinevo-store";

type Section = { key: string; title: string; type?: string };

export function JellyfinConnect() {
  const addRemoteTitles = useCinevo((s) => s.addRemoteTitles);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const plexClient = useCinevo((s) => s.plexClientId);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8096");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<{ token: string; userId: string; username: string; baseUrl: string } | null>(
    null,
  );
  const [sections, setSections] = useState<Section[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  const clientId = () => {
    const existing = plexClient || plexClientId();
    if (!plexClient && existing) useCinevo.setState({ plexClientId: existing });
    return existing;
  };

  const connect = async () => {
    if (!username.trim() || !password) {
      setMessage("Enter your Jellyfin username and password.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const res = await jellyfinConnect({
        data: { baseUrl: baseUrl.trim(), username: username.trim(), password, clientId: clientId() },
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      const listed = await jellyfinListSections({
        data: { baseUrl: res.baseUrl, token: res.token, userId: res.userId, clientId: clientId() },
      });
      if (!listed.ok) {
        setMessage(listed.error);
        return;
      }
      setSession({ token: res.token, userId: res.userId, username: res.username, baseUrl: res.baseUrl });
      setSections(listed.sections);
      setPicked(listed.sections.map((s) => s.key));
      setPassword("");
      setMessage(
        listed.sections.length
          ? `Signed in as ${res.username}. Choose libraries to index.`
          : "Signed in, but this user has no movie or series libraries yet.",
      );
    } finally {
      setPending(false);
    }
  };

  const importPicked = async () => {
    if (!session || !picked.length) return;
    setPending(true);
    try {
      const res = await jellyfinImportSections({
        data: {
          baseUrl: session.baseUrl,
          token: session.token,
          userId: session.userId,
          clientId: clientId(),
          sourceLabel: session.username || "Jellyfin",
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
          source: "jellyfin",
          sourceLabel: t.sourceLabel || session.username || "Jellyfin",
          genre: t.genre,
          genres: t.genres,
          runtime: t.runtime,
          rating: t.rating,
          cast: t.cast,
          director: t.director,
          path: t.path || t.id.replace(/^jellyfin-/, ""),
          folder: t.folder,
        }),
      );
      addRemoteTitles(titles, {
        id: `jellyfin-${session.userId}`,
        kind: "jellyfin",
        name: session.username || "Jellyfin",
        baseUrl: session.baseUrl,
        accessToken: session.token,
        userId: session.userId,
        selected: true,
        count: titles.length,
        folders: res.folders,
      });
      setSections([]);
      setMessage(`Imported ${titles.length} titles. CINEVO will proxy playback from this Jellyfin server.`);
    } finally {
      setPending(false);
    }
  };

  return (
    <article className="glass rounded-xl p-4">
      <HardDrive className="text-cine-cyan" size={20} />
      <h3 className="mt-3 font-ui text-lg font-semibold tracking-tight">Jellyfin</h3>
      <p className="mt-1 text-sm text-cine-faint">
        Sign in with a username. If this address is reachable from here, CINEVO indexes and proxies playback — no Node
        required. Home-network-only servers still use{" "}
        <Link to="/node" className="text-cine-cyan" onClick={() => setCoreOpen(false)}>
          CINEVO Node
        </Link>
        .
      </p>
      <input
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        aria-label="Jellyfin server address"
        className="mt-3 h-11 w-full rounded-md border border-cine-border bg-cine-well px-3 font-mono text-sm"
      />
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        aria-label="Jellyfin username"
        autoComplete="username"
        className="mt-2 h-11 w-full rounded-md border border-cine-border bg-cine-well px-3 font-ui"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={session ? "Signed in — reconnect to change" : "Password"}
        aria-label="Jellyfin password"
        autoComplete="current-password"
        className="mt-2 h-11 w-full rounded-md border border-cine-border bg-cine-well px-3 font-ui"
      />
      <button
        type="button"
        onClick={() => void connect()}
        disabled={pending}
        className="mt-3 h-11 w-full rounded-md bg-cine-cyan font-ui font-bold text-cine-bg"
      >
        {pending ? <LoaderCircle className="mx-auto animate-spin" size={16} /> : session ? "Reconnect" : "Sign in to Jellyfin"}
      </button>

      {sections.length ? (
        <div className="mt-4 rounded-md bg-cine-well p-3">
          <p className="font-ui text-xs font-medium uppercase tracking-[0.1em] text-cine-cyan">
            {session?.username || "Jellyfin"} · libraries
          </p>
          <div className="mt-3 space-y-2">
            {sections.map((s) => (
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

      {message ? <p className="mt-3 text-sm text-cine-cyan">{message}</p> : null}
    </article>
  );
}
