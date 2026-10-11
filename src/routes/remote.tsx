import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { Logo } from "@/components/cinevo/logo";
import { InstallCinevo } from "@/components/cinevo/house-remote";
import { PhoneApps } from "@/components/cinevo/installers";
import { readPhoneRemote, sendRemoteCommand } from "@/lib/remote-client";
import { normalizeCode, type RemoteNow } from "@/lib/remote-protocol";

export const Route = createFileRoute("/remote")({
  component: RemotePage,
  head: () => ({
    meta: [
      { title: "CINEVO Remote" },
      { name: "description", content: "Control the CINEVO house that is open on your screen." },
      { name: "theme-color", content: "#050505" },
    ],
  }),
});

const PHONE_CODE = "cinevo-phone-code";

function CastNode() {
  const [base, setBase] = useState(() => {
    try {
      return localStorage.getItem("cinevo-cast-base") || "";
    } catch {
      return "";
    }
  });
  const [castCode, setCastCode] = useState("");
  const [titles, setTitles] = useState<{ id: string; title: string }[]>([]);
  const [message, setMessage] = useState("");

  const origin = base.trim().replace(/\/$/, "");

  const load = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setMessage("");
    if (!/^https?:\/\//.test(origin)) {
      setMessage("Use the server address, like http://192.168.1.20:48184");
      return;
    }
    try {
      localStorage.setItem("cinevo-cast-base", origin);
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch(`${origin}/v1/receiver`);
      const data = (await res.json()) as { titles?: { id: string; title: string }[]; error?: string };
      if (!res.ok) {
        setMessage(data.error || "That server did not answer.");
        return;
      }
      setTitles(Array.isArray(data.titles) ? data.titles : []);
      setMessage(data.titles?.length ? "Server found. Enter the cast code shown on its screen." : "Server found. Scan a folder on it, then cast.");
    } catch {
      setMessage("Could not reach that server. Use the phone app on the same Wi-Fi.");
    }
  };

  const cast = async (body: Record<string, string | number>) => {
    if (normalizeCode(castCode).length !== 6) {
      setMessage("Enter the cast code from the server screen.");
      return;
    }
    try {
      const res = await fetch(`${origin}/v1/cast`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, code: castCode }),
      });
      const data = (await res.json()) as { error?: string };
      setMessage(res.ok ? "Sent to the server." : data.error || "The server refused that.");
    } catch {
      setMessage("Could not reach that server.");
    }
  };

  return (
    <section className="remote-join glass-strong">
      <h2>Cast to a server</h2>
      <p>The Cast button in the player, on a title, and in the Android app uses this same server and code.</p>
      <form onSubmit={(event) => void load(event)}>
        <label>
          Server
          <input value={base} placeholder="http://192.168.1.20:48184" onChange={(event) => setBase(event.target.value)} />
        </label>
        <label>
          Cast code
          <input value={castCode} autoCapitalize="characters" placeholder="ABC-DEF" onChange={(event) => setCastCode(event.target.value.toUpperCase())} />
        </label>
        <button type="submit" className="house-btn">
          Find server
        </button>
      </form>
      {message ? <p>{message}</p> : null}
      <div className="remote-transport">
        <button type="button" onClick={() => void cast({ type: "pause" })}>Pause</button>
        <button type="button" onClick={() => void cast({ type: "play" })}>Play</button>
        <button type="button" onClick={() => void cast({ type: "seek", by: 10 })}>Forward</button>
      </div>
      {titles.length ? (
        <ul className="remote-titles">
          {titles.slice(0, 12).map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => void cast({ type: "playTitle", titleId: item.id })}>
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RemotePage() {
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState("");
  const [now, setNow] = useState<RemoteNow | null>(null);
  const [ageMs, setAgeMs] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    try {
      const saved = normalizeCode(localStorage.getItem(PHONE_CODE));
      if (saved) {
        setCode(saved);
        setDraft(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    let stop = false;
    const tick = async () => {
      const res = await readPhoneRemote(code);
      if (stop) return;
      if (!res.ok || !res.now) {
        setError(res.error || "The house did not answer.");
        setNow(null);
        return;
      }
      setError("");
      setNow(res.now);
      setAgeMs(res.ageMs ?? 0);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 1000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [code]);

  const join = (event: React.FormEvent) => {
    event.preventDefault();
    const next = normalizeCode(draft);
    if (!next) {
      setError("Enter the six-character code from the house.");
      return;
    }
    setError("");
    setCode(next);
    try {
      localStorage.setItem(PHONE_CODE, next);
    } catch {
      /* ignore */
    }
  };

  const send = async (command: Parameters<typeof sendRemoteCommand>[1]) => {
    if (!code) return;
    setPending(true);
    const res = await sendRemoteCommand(code, command);
    setPending(false);
    if (!res.ok) setError(res.error || "The house did not take that.");
    else if (now && (command.type === "play" || command.type === "pause" || command.type === "toggle")) {
      setNow({ ...now, playing: command.type === "pause" ? false : command.type === "play" ? true : !now.playing });
    }
  };

  const live = Boolean(now && ageMs < 8000);
  const playing = Boolean(now?.playing);

  return (
    <main className="remote-app">
      <header className="remote-app__bar">
        <Logo size="sm" tagline={false} />
        <span>Remote</span>
      </header>

      {!code ? (
        <form className="remote-join glass-strong" onSubmit={join}>
          <h1>Control the house</h1>
          <p>This remote controls a CINEVO screen, and it can cast to a CINEVO Server on your network.</p>
          <label>
            House code
            <input
              value={draft}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={7}
              placeholder="ABC-DEF"
              onChange={(event) => setDraft(event.target.value.toUpperCase())}
            />
          </label>
          {error ? <p className="remote-app__error">{error}</p> : null}
          <button type="submit" className="house-btn">
            Connect
          </button>
        </form>
      ) : (
        <section className="remote-pad">
          <div className="remote-now glass">
            <p className={live ? "is-live" : ""}>{live ? "House is open" : "Waiting for the house"}</p>
            <h1>{now?.title || "Nothing is playing"}</h1>
            <small>{now?.detail || (live ? "Pick a title below, or press play on the house." : "Keep CINEVO open on the screen you want to control.")}</small>
          </div>
          {error ? <p className="remote-app__error">{error}</p> : null}
          <div className="remote-transport">
            <button type="button" aria-label="Back 10 seconds" disabled={!live || pending} onClick={() => void send({ type: "seek", by: -10 })}>
              <SkipBack />
            </button>
            <button type="button" className="is-main" aria-label={playing ? "Pause" : "Play"} disabled={!live || pending} onClick={() => void send({ type: playing ? "pause" : "play" })}>
              {playing ? <Pause /> : <Play />}
            </button>
            <button type="button" aria-label="Forward 10 seconds" disabled={!live || pending} onClick={() => void send({ type: "seek", by: 10 })}>
              <SkipForward />
            </button>
          </div>
          <div className="remote-sliders">
            <label>
              Position
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                disabled={!live || !now?.title}
                value={Math.round(now?.position ?? 0)}
                onChange={(event) => now && setNow({ ...now, position: Number(event.target.value) })}
                onPointerUp={(event) => void send({ type: "seek", to: Number((event.target as HTMLInputElement).value) })}
              />
            </label>
            <label>
              Volume
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                disabled={!live}
                value={Math.round((now?.volume ?? 1) * 100)}
                onChange={(event) => now && setNow({ ...now, volume: Number(event.target.value) / 100 })}
                onPointerUp={(event) => void send({ type: "volume", value: Number((event.target as HTMLInputElement).value) / 100 })}
              />
            </label>
          </div>
          <button type="button" className="house-btn house-btn--ghost remote-stop" disabled={!live || pending} onClick={() => void send({ type: "stop" })}>
            <Square size={14} /> Stop
          </button>
          <div className="remote-titles">
            <h2>In this library</h2>
            {now?.titles.length ? (
              <ul>
                {now.titles.map((item) => (
                  <li key={item.id}>
                    <button type="button" disabled={!live || pending} onClick={() => void send({ type: "playTitle", titleId: item.id })}>
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No imported titles yet. Add a library on the house, then they show up here.</p>
            )}
          </div>
          <button
            type="button"
            className="remote-forget"
            onClick={() => {
              setCode("");
              setNow(null);
              try {
                localStorage.removeItem(PHONE_CODE);
              } catch {
                /* ignore */
              }
            }}
          >
            Use a different code
          </button>
        </section>
      )}

      <footer className="remote-app__foot">
        <CastNode />
        <InstallCinevo compact />
        <p className="remote-app__kicker">Get the player</p>
        <PhoneApps />
        <p>
          Android and Android TV are sideload apps. The iPhone profile installs the same player on the Home Screen. It watches, casts, and remotes. A localhost address will not open from the phone.
        </p>
      </footer>
    </main>
  );
}
