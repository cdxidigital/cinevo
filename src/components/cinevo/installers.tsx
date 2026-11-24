import { ArrowUpRight, Download } from "lucide-react";
import { INSTALLERS } from "@/lib/node-client";

export function InstallerCards() {
  return (
    <div className="app-shelf app-shelf--grid">
      {INSTALLERS.map((item) => (
        <a key={item.id} href={item.href} download className="dl-card">
          <img src="/node-icon.png" alt="" />
          <p className="dl-card__kicker">{item.label}</p>
          <strong>{item.arch}</strong>
          <p>{item.hint}</p>
          <span className="dl-card__go">
            <Download size={16} /> Download Server
          </span>
        </a>
      ))}
    </div>
  );
}

const PHONE_APPS = [
  {
    id: "web",
    kicker: "Web app",
    title: "CINEVO",
    detail: "The installable player in the browser. Same sign-in. Opens your library.",
    href: "/app",
    download: false,
    action: "Open player",
    icon: "open" as const,
  },
  {
    id: "windows-player",
    kicker: "Windows",
    title: "CINEVO Player",
    detail: "Signed player for this PC. It plays a file on the computer and opens your CINEVO house. It listens only on this machine.",
    href: "/installers/CINEVO-Player-Windows-x64.exe",
    download: true,
    action: "Download EXE",
    icon: "download" as const,
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
    id: "android-remote",
    kicker: "Android remote",
    title: "CINEVO Remote",
    detail: "A separate signed remote. Enter the house address and the six-character code. It sends play, pause, seek, and stop. It does not receive file paths.",
    href: "/installers/CINEVO-Remote.apk",
    download: true,
    action: "Download remote",
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
    <div className="app-shelf app-shelf--grid">
      {PHONE_APPS.map((item) => (
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
  );
}
