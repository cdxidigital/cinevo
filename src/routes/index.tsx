import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownRight, Play, ShieldCheck } from "lucide-react";
import { InstallerCards, PhoneApps } from "@/components/cinevo/installers";
import { Logo, Mark } from "@/components/cinevo/logo";
import { LandingAuth } from "@/components/cinevo/account";
import { Reveal } from "@/components/cinevo/cine-motion";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCinevo } from "@/lib/cinevo-store";
import { THEMES } from "@/lib/library";

export const Route = createFileRoute("/")({ component: Home });

const POSTERS = [
  "neon-blade",
  "glass-harbor",
  "midnight-protocol",
  "tokyo-neon",
  "ember-choir",
  "northbridge",
  "crimson-code",
  "stillwater",
];

const STEPS = [
  { n: "01", t: "Open the house", d: "A passkey, a phone, or a password. The seat is yours on every screen." },
  { n: "02", t: "Bring the library", d: "Plex, Jellyfin, a folder, or CINEVO Server. Pick the sections. Leave the rest." },
  { n: "03", t: "Press play", d: "CINEVO proxies the file and converts what this browser cannot. Nothing is published." },
];

const HIGHLIGHTS = [
  {
    n: "01",
    eyebrow: "YOUR FILES",
    title: "Tonight starts here.",
    description: "Connect the server you already trust. CINEVO plays the file, and asks that server to convert what a browser cannot.",
  },
  {
    n: "02",
    eyebrow: "EVERY SCREEN",
    title: "Watch, cast, or remote.",
    description: "The player is the same on the web, a phone, and a television. The server stays with the files.",
  },
  {
    n: "03",
    eyebrow: "EIGHT GLASS HOUSES",
    title: "A theme that stays readable.",
    description: "Pick a glass look. Titles, buttons, and the CINEVO mark keep their contrast on every page.",
  },
];

function EnterHouse({ className = "public-primary", label = "Enter CINEVO" }: { className?: string; label?: string }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || !user || user.isDevFallback) {
    return (
      <Link to="/login" search={{ mode: "in" }} className={className}>
        <Play size={15} fill="currentColor" /> {label}
      </Link>
    );
  }
  return (
    <Link to="/app" className={className}>
      <Play size={15} fill="currentColor" /> {label}
    </Link>
  );
}

function Home() {
  const theme = useCinevo((s) => s.prefs.theme);
  const setTheme = useCinevo((s) => s.setTheme);

  return (
    <div className="public-home">
      <header className="public-nav">
        <nav aria-label="Homepage">
          <Link to="/app" search={{ room: "library" }}>
            Your library
          </Link>
          <Link to="/node">Server</Link>
          <Link to="/help">Help</Link>
        </nav>
        <div className="public-nav__actions">
          <LandingAuth />
        </div>
      </header>

      <main>
        <section className="public-hero" aria-labelledby="public-hero-title">
          <img src="/stills/hero-theater.jpg" alt="" className="public-hero__still" />
          <div className="public-hero__veil" />
          <div className="public-hero__content">
            <Logo size="xl" layout="stacked" tagline={false} className="public-hero__logo" />
            <h1 id="public-hero-title">
              <span>Your media.</span>
              <em>Your moment.</em>
            </h1>
            <p>
              The films and shows you already keep, playing like a cinema. Plex, Jellyfin, or a folder at home — one house, every screen.
            </p>
            <div className="public-hero__actions">
              <EnterHouse label="Play your library" />
              <Link to="/login" search={{ mode: "up" }} className="public-secondary">
                Create account <ArrowDownRight size={16} />
              </Link>
            </div>
            <div className="public-hero__note">
              <ShieldCheck size={16} />
              <span>
                <b>Private from the first connection</b>
                <small>Personal media stays on your computer or the server you own.</small>
              </span>
            </div>
          </div>
          <div className="home-marquee" aria-hidden="true">
            <div className="home-marquee__track">
              {[...POSTERS, ...POSTERS].map((id, i) => (
                <img key={`${id}-${i}`} src={`/posters/${id}.jpg`} alt="" />
              ))}
            </div>
          </div>
        </section>

        <section className="home-reel" aria-labelledby="home-reel-title">
          <Reveal as="header">
            <div>
              <span className="public-kicker">GLASS THEMES</span>
              <h2 id="home-reel-title">Eight houses. Pick the mood.</h2>
            </div>
            <p>Eight looks. Same layout. Titles, buttons, and the mark stay easy to read.</p>
          </Reveal>
          <div className="theme-rail" role="listbox" aria-label="Glass themes">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={theme === item.id}
                className={theme === item.id ? "is-on" : undefined}
                onClick={() => setTheme(item.id)}
              >
                <i className="swatch" data-swatch={item.id} />
                <b>{item.label}</b>
                <small>{item.feel}</small>
              </button>
            ))}
          </div>
          <div className="home-library-steps">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} as="article" delay={i * 90}>
                <span>{step.n}</span>
                <h3>{step.t}</h3>
                <p>{step.d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="home-highlights" id="sharing" aria-labelledby="home-highlights-title">
          <Reveal as="header">
            <span className="public-kicker">WHAT YOU GET</span>
            <h2 id="home-highlights-title">Sit down. The library is already yours.</h2>
          </Reveal>
          <div className="home-highlights__grid">
            {HIGHLIGHTS.map((item, i) => (
              <Reveal key={item.n} delay={i * 70}>
                <article className="home-highlight">
                  <span>{item.n}</span>
                  <em>{item.eyebrow}</em>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="home-downloads" id="downloads">
          <Reveal>
            <span className="public-kicker">TWO APPS</span>
            <h2 className="mt-4 font-ui text-4xl font-semibold leading-tight tracking-tight md:text-5xl">Server at home. Player everywhere.</h2>
            <p className="mt-4 mb-10 max-w-xl text-sm text-cine-muted">
              CINEVO Server stays on the computer that holds the files. CINEVO is the player — the web app, Android, and iPhone.
            </p>
          </Reveal>
          <Reveal delay={40}>
            <p className="public-kicker">CINEVO SERVER</p>
            <h2 className="mt-3 mb-5 font-ui text-2xl font-semibold tracking-tight">Install where the library lives.</h2>
            <InstallerCards />
          </Reveal>
          <Reveal delay={120}>
            <p className="public-kicker mt-14">CINEVO PLAYER</p>
            <h2 className="mt-4 font-ui text-3xl font-semibold tracking-tight md:text-4xl">One player. Every screen.</h2>
            <p className="mt-3 mb-6 max-w-xl text-sm text-cine-muted">
              One player for the web, a phone, and a television. The files stay on the server you choose.
            </p>
            <PhoneApps />
          </Reveal>
        </section>

        <section className="home-closing">
          <Reveal>
            <span className="public-kicker">
              <Mark className="public-kicker__gem" /> CINEVO · CINEMA, REINVENTED
            </span>
            <h2>
              A home for your
              <br />
              <em>entire world of stories.</em>
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p>The lights are down. Connect a library, then take your seat.</p>
            <EnterHouse label="Begin with your library" />
          </Reveal>
        </section>
      </main>

      <footer className="public-footer">
        <Link to="/" className="public-brand" aria-label="CINEVO home">
          <Logo size="lg" layout="stacked" />
        </Link>
        <div>
          <p className="public-footer__credit">
            <a href="https://www.fourtee2.digital" target="_blank" rel="noreferrer">
              CINEVO - a fourtee2digital project
            </a>
          </p>
          <nav className="public-footer__links" aria-label="More">
            <Link to="/node">Server</Link>
            <Link to="/help">Help</Link>
            <Link to="/legal/privacy">Privacy</Link>
            <Link to="/legal/terms">Terms</Link>
          </nav>
        </div>
        <EnterHouse className="public-footer__enter" label="Enter CINEVO" />
      </footer>
    </div>
  );
}
