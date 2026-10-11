import { useEffect, useState } from "react";
import { Cast, Monitor, X } from "lucide-react";
import { castBlock, type WirelessVideo } from "@/lib/cast";
import { useCinevo } from "@/lib/cinevo-store";
import { normalizeCode } from "@/lib/remote-protocol";

export type CastRequest = { titleId?: string };

export function openCast(detail: CastRequest = {}) {
  window.dispatchEvent(new CustomEvent("cinevo-open-cast", { detail }));
}

function playerVideo() {
  return document.querySelector<WirelessVideo>("[data-cinevo-player]");
}

export function CastSheet() {
  const [request, setRequest] = useState<CastRequest | null>(null);
  const nodeUrl = useCinevo((s) => s.nodeUrl);
  const flash = useCinevo((s) => s.flash);
  const [base, setBase] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<CastRequest>).detail || {};
      setRequest(detail);
      setNote("");
      try {
        setBase(localStorage.getItem("cinevo-cast-base") || "");
      } catch {
        setBase("");
      }
    };
    window.addEventListener("cinevo-open-cast", onOpen);
    return () => window.removeEventListener("cinevo-open-cast", onOpen);
  }, []);

  if (!request) return null;
  const server = (base || nodeUrl || "").trim().replace(/\/$/, "");

  const wireless = () => {
    const video = playerVideo();
    const file = video?.currentSrc || video?.src;
    const block = castBlock(file, window.location.href);
    if (!video || block === "local") {
      setNote("Start the title on this screen first. A file that only exists in this browser cannot be sent to a TV.");
      return;
    }
    if (block === "loopback") {
      setNote("This page is on localhost. A TV cannot open it. Use the house address on your network.");
      return;
    }
    const remote = video.remote;
    if (remote?.prompt) {
      void remote.prompt().catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "AbortError") return;
        if (typeof video.webkitShowPlaybackTargetPicker === "function") {
          video.webkitShowPlaybackTargetPicker();
          return;
        }
        setNote("No Cast or AirPlay receiver answered. Use the same Wi-Fi, then try CINEVO Server.");
      });
      return;
    }
    if (typeof video.webkitShowPlaybackTargetPicker === "function") {
      video.webkitShowPlaybackTargetPicker();
      return;
    }
    setNote("This screen has no Cast or AirPlay. Send it to a CINEVO Server instead.");
  };

  const sendToServer = async () => {
    if (!/^https?:\/\//.test(server)) {
      setNote("Use the server address, like http://192.168.1.20:48184");
      return;
    }
    if (normalizeCode(code).length !== 6) {
      setNote("Enter the cast code shown on the CINEVO Server screen.");
      return;
    }
    try {
      localStorage.setItem("cinevo-cast-base", server);
    } catch {
      /* ignore */
    }
    const body: Record<string, string> = { code, type: "play" };
    if (request.titleId) {
      body.type = "playTitle";
      body.titleId = request.titleId;
    }
    try {
      const res = await fetch(`${server}/v1/cast`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote(data.error || "The server refused that.");
        return;
      }
      flash("Sent to CINEVO Server");
      setRequest(null);
    } catch {
      setNote("Could not reach that server. It has to be on this network.");
    }
  };

  return (
    <div className="cast-sheet" role="dialog" aria-label="Cast">
      <header>
        <Cast size={16} />
        <strong>Cast</strong>
        <button type="button" aria-label="Close cast" onClick={() => setRequest(null)}>
          <X size={16} />
        </button>
      </header>
      <button type="button" className="house-btn house-btn--ghost" onClick={wireless}>
        <Monitor size={16} /> This screen · Cast or AirPlay
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendToServer();
        }}
      >
        <label>
          CINEVO Server
          <input
            value={base || (nodeUrl.startsWith("http") ? nodeUrl : "")}
            placeholder="http://192.168.1.20:48184"
            onChange={(event) => setBase(event.target.value)}
          />
        </label>
        <label>
          Cast code
          <input
            value={code}
            autoCapitalize="characters"
            placeholder="ABC-DEF"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <button type="submit" className="house-btn house-btn--play">
          Play on the server
        </button>
      </form>
      {note ? <p>{note}</p> : <p>The TV, the phone, and this house use the same cast code.</p>}
    </div>
  );
}
