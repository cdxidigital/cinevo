import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicFrame } from "@/components/cinevo/public-frame";

export const Route = createFileRoute("/help")({ component: Help });

function Help() {
  return (
    <PublicFrame
      kicker="HELP"
      title="How the house works."
      lede="CINEVO only shows media you connect. Preview House is labelled, uses licensed shorts, and is not your library."
    >
      <section>
        <h2>Sign in</h2>
        <p>Use Google, X, or email and a password. After that, claim a username so friends can share a catalog with you.</p>
      </section>
      <section>
        <h2>Add a library</h2>
        <p>Open Library and pick one source at a time: a folder on this computer, Plex, Jellyfin, or CINEVO Node. Folder names stay in this browser. Plex and Jellyfin stay on the server you sign in to.</p>
      </section>
      <section>
        <h2>Watch</h2>
        <p>Playback starts with the original file. If the browser cannot play it, CINEVO converts it. A Plex or Jellyfin server makes an H.264 copy on that server. A file on CINEVO Node is converted there, in short pieces, so it can start and be skipped through. That needs ffmpeg installed on the computer running Node. Choose Grid, List, or Hybrid on Movies, TV, and Library, and sort by title, year, or when it was added.</p>
      </section>
      <section>
        <h2>On a TV</h2>
        <p>While a proxied title is playing, use the TV button. Android and Chrome offer Cast. Safari on iPhone, iPad, and Mac offers AirPlay. The TV opens that same stream, so the house has to be an address on your network, not localhost. A file that only exists in this browser cannot be sent.</p>
      </section>
      <section>
        <h2>Share</h2>
        <p>
          Sharing sends a catalog invite, not the files. Open <Link to="/app" search={{ core: "sharing" }}>Sharing</Link> after you sign in.
        </p>
      </section>
      <section>
        <h2>Preview House</h2>
        <p>After you sign in, Enter Preview House plays three Creative Commons shorts from the Blender Foundation. A banner stays on screen. Progress there is not written into your library. Connect your real library to leave it.</p>
      </section>
      <section>
        <h2>Away from home</h2>
        <p>Node listens on this computer. CINEVO does not open a router port. Use Tailscale, WireGuard, or your own reverse proxy, then pair the phone to that private address. Settings has a button that copies these notes.</p>
      </section>
      <section>
        <h2>Offline</h2>
        <p>Titles you have already loaded stay in this browser. If Node is down, a limited-mode note appears. Save for offline keeps a copy of a preview file on this device only. Remove from device deletes that copy. Your own server files are not uploaded anywhere.</p>
      </section>
      <section>
        <h2>Your house</h2>
        <p>Streaks and badges are calculated only from this account. There is no leaderboard. Turn Personal milestones off in Settings to hide them.</p>
      </section>
      <section>
        <h2>Node and the remote</h2>
        <p>
          <Link to="/node">Pair Node</Link> on the computer that holds the files. The phone remote controls titles already in this house.
        </p>
      </section>
    </PublicFrame>
  );
}
