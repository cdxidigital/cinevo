import { ArrowUpRight, Download } from "lucide-react";

export function InstallerCards() {
  return (
    <div role="status" className="tool-card" aria-live="polite">
      <h3 className="font-ui text-lg font-semibold">Native installers temporarily unavailable</h3>
      <p>We are replacing older installer signatures after a release-security review. Do not use previously distributed packages until the new signed installers are published.</p>
      <p>The browser player remains available while the releases are verified.</p>
    </div>
  );
}

const PHONE_APPS = [
  {
    id: "web",
    kicker: "Web app",
    title: "CINEVO",
    detail: "The installable player for Windows, Mac, Linux, and phones. Same sign-in. Opens your library. No second desktop app.",
    href: "/app",
    download: false,
    action: "Open player",
    icon: "open" as const,
  },
  {
    id: "android",
    kicker: "Android",
    title: "CINEVO 2.0",
    detail: "The phone player. Watch on the phone, cast to a TV, or send the title to a CINEVO Server. Sideload. No store account.",
    href: "/installers/CINEVO.apk",
    download: true,
    action: "Download APK",
    icon: "download" as const,
  },
  {
    id: "android-tv",
    kicker: "Android TV",
    title: "CINEVO TV",
    detail: "Sideload player for a television. Sign in with a QR code. The TV remote and the phone remote both work.",
    href: "/installers/CINEVO-TV.apk",
    download: true,
    action: "Download TV APK",
    icon: "download" as const,
  },
  {
    id: "ios-profile",
    kicker: "iPhone & iPad",
    title: "CINEVO",
    detail: "Home Screen player for iPhone and iPad. Watch, cast to a CINEVO Server, and use it as a remote. No App Store.",
    href: "/api/ios-profile",
    download: false,
    action: "Get iOS app",
    icon: "download" as const,
  },
] as const;

export function PhoneApps() {
  return (
    <div>
      <p role="status" className="mb-4 text-sm text-cine-muted">Android and Android TV APK downloads are paused while new signing credentials are verified. The web and iOS Home Screen versions remain available.</p>
      <div className="app-shelf app-shelf--grid">
      {PHONE_APPS.filter((item) => item.id !== "android" && item.id !== "android-tv").map((item) => (
        <a key={item.id} href={item.href} download={item.download || undefined} className="dl-card">
          <img src="/app-icon.png" alt="" />
          <p className="dl-card__kicker">{item.kicker}</p>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
          <span className="dl-card__go">
            {item.icon === "open" ? <ArrowUpRight size={16} /> : <Download size={16} />} {item.action}
          </span>
        </a>
      ))}
      </div>
    </div>
  );
}
