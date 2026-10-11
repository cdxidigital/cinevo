import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Cable, FolderPlus, HardDrive, Server, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { addNodeFolder } from "@/lib/node-client";
import { remoteTitle, scanFileList, isVideoFile, playableCount, FOLDER_SCAN_CAP } from "@/lib/library";
import { enrichLocalStills } from "@/lib/local-stills";
import { reconnectFolders, saveFolderHandle } from "@/lib/folder-handles";
import { useCinevo } from "@/lib/cinevo-store";
import { PlexConnect } from "./plex-connect";
import { JellyfinConnect } from "./jellyfin-connect";

type Method = "pick" | "plex" | "jellyfin" | "folder" | "node";

const METHODS: { id: Exclude<Method, "pick">; title: string; copy: string; icon: typeof Server }[] = [
  { id: "plex", title: "Plex", copy: "Sign in and pick servers — home, shared, or remote.", icon: Server },
  { id: "jellyfin", title: "Jellyfin", copy: "Username and address. Playback is proxied through CINEVO.", icon: HardDrive },
  { id: "folder", title: "This computer", copy: "Pick a folder in this browser. Names only — files stay here.", icon: FolderPlus },
  { id: "node", title: "CINEVO Node", copy: "Scan a disk path on the machine that holds the files.", icon: Cable },
];

export function AddLibrary() {
  const sources = useCinevo((s) => s.sources);
  const localTitles = useCinevo((s) => s.localTitles);
  const removeSource = useCinevo((s) => s.removeSource);
  const addFolderTitles = useCinevo((s) => s.addFolderTitles);
  const addRemoteTitles = useCinevo((s) => s.addRemoteTitles);
  const nodeUrl = useCinevo((s) => s.nodeUrl);
  const nodeToken = useCinevo((s) => s.nodeToken);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const fileRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<Method>("pick");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [folderPath, setFolderPath] = useState("");

  useEffect(() => {
    const onFiles = (event: Event) => {
      const files = (event as CustomEvent<File[]>).detail;
      if (Array.isArray(files) && files.length) ingestFiles(files, "Home folder");
    };
    window.addEventListener("cinevo:files", onFiles);
    return () => window.removeEventListener("cinevo:files", onFiles);
    // ingestFiles is recreated each render; listen once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ingestFiles = (files: FileList | File[], name?: string) => {
    const titles = scanFileList(files, name);
    if (!titles.length) {
      setMessage("No video files in that folder. mp4, mkv, mov, webm.");
      return;
    }
    const folder = titles[0].sourceLabel;
    addFolderTitles(titles, {
      id: `src-folder-${folder}`,
      kind: "folder",
      name: folder,
      selected: true,
      count: titles.length,
    });
    void enrichLocalStills(titles, Array.from(files));
    const stopped = Array.from(files).filter((f) => isVideoFile(f.name) || isVideoFile(f.webkitRelativePath || "")).length > titles.length;
    setMessage(
      stopped
        ? `Indexed the first ${titles.length} videos from ${folder}. Split a very large folder if more episodes remain.`
        : `Indexed ${titles.length} files from ${folder}, including episodes in season folders.`,
    );
  };

  const onFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) ingestFiles(e.target.files);
    e.target.value = "";
  };

  const pickDirectory = async () => {
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      fileRef.current?.click();
      return;
    }
    try {
      const handle = await picker();
      const files: File[] = [];
      await walkDir(handle, files);
      ingestFiles(files, handle.name);
      await saveFolderHandle(`src-folder-${handle.name}`, handle, handle.name);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      fileRef.current?.click();
    }
  };

  const addPath = async () => {
    if (!folderPath.trim()) return;
    if (!nodeToken) {
      setMessage("Pair CINEVO Node to scan a path on the computer that holds the files.");
      return;
    }
    setPending(true);
    try {
      const res = await addNodeFolder(nodeUrl, nodeToken, folderPath.trim());
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      const titles = res.titles.map((t, i) => ({
        ...remoteTitle({
          id: t.id || `node-folder-${i}`,
          title: t.title || "Untitled",
          year: t.year,
          source: "plex",
          sourceLabel: res.name,
          synopsis: `Indexed from ${res.name} on CINEVO Node. Playback streams from that computer.`,
          genre: "Home library",
          path: t.path,
          poster: t.poster,
          still: t.poster,
        }),
        source: "folder" as const,
        sourceLabel: res.name,
        genre: "Home library",
        genres: ["Home library", res.name],
        path: t.path,
        folder: t.folder,
      }));
      addRemoteTitles(titles, {
        id: res.id,
        kind: "folder",
        name: res.name,
        path: folderPath.trim(),
        baseUrl: nodeUrl,
        selected: true,
        count: res.count,
        folders: res.network,
      });
      setFolderPath("");
      setMessage(`Scanned ${res.count} files on Node. Playback streams from that computer.`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <input
        ref={fileRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is a Chromium attribute
        webkitdirectory=""
        className="hidden"
        aria-label="Select media folder"
        onChange={onFolder}
      />

      {method === "pick" ? (
        <div>
          <p className="font-ui text-xs font-semibold tracking-[0.1em] text-cine-cyan">IMPORT A LIBRARY</p>
          <h3 className="mt-2 font-ui text-2xl font-semibold tracking-tight">Choose a source.</h3>
          <p className="mt-1 text-sm text-cine-faint">Plex and Jellyfin play through CINEVO. Folders stay on this device. Node scans a disk on another machine.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {METHODS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMethod(item.id);
                    setMessage("");
                  }}
                  className="glass flex min-h-28 flex-col items-start rounded-xl p-4 text-left hover:border-cine-cyan"
                >
                  <Icon className="text-cine-cyan" size={20} />
                  <b className="mt-3 font-ui text-lg font-semibold tracking-tight">{item.title}</b>
                  <span className="mt-1 text-sm text-cine-faint">{item.copy}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setMethod("pick");
              setMessage("");
            }}
            className="inline-flex h-11 items-center gap-2 font-ui text-sm text-cine-muted hover:text-cine-text"
          >
            <ArrowLeft size={16} /> All sources
          </button>
          {method === "plex" ? <PlexConnect /> : null}
          {method === "jellyfin" ? <JellyfinConnect /> : null}
          {method === "folder" ? (
            <article className="glass rounded-xl p-4">
              <FolderPlus className="text-cine-cyan" size={20} />
              <h3 className="mt-3 font-ui text-lg font-semibold tracking-tight">This computer</h3>
              <p className="mt-1 text-sm text-cine-faint">Pick a folder here. CINEVO indexes names only — files never leave this browser.</p>
              <button
                type="button"
                onClick={() => void pickDirectory()}
                className="mt-4 h-11 w-full rounded-md bg-cine-cyan font-ui font-bold text-cine-bg"
              >
                Select folders
              </button>
            </article>
          ) : null}
          {method === "node" ? (
            <article className="glass rounded-xl p-4">
              <Cable className="text-cine-cyan" size={20} />
              <h3 className="mt-3 font-ui text-lg font-semibold tracking-tight">CINEVO Node</h3>
              <p className="mt-1 text-sm text-cine-faint">
                Pair Node on the computer that holds the files, then scan a path. Playback streams from that machine.
              </p>
              {!nodeToken ? (
                <p className="mt-3 text-sm text-cine-muted">
                  Pair first on{" "}
                  <Link to="/node" className="text-cine-cyan" onClick={() => setCoreOpen(false)}>
                    the Node page
                  </Link>
                  .
                </p>
              ) : (
                <p className="mt-3 text-sm text-cine-cyan">Node is paired on this browser.</p>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="/Movies or D:\\Media"
                  aria-label="Folder path on Node"
                  className="h-11 min-w-0 flex-1 rounded-md border border-cine-border bg-cine-well px-3 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => void addPath()}
                  disabled={pending}
                  className="h-11 rounded-md border border-cine-cyan px-3 font-ui font-bold text-cine-cyan"
                >
                  Scan
                </button>
              </div>
            </article>
          ) : null}
        </div>
      )}

      {localTitles.length && playableCount() === 0 ? (
        <div className="glass rounded-xl px-4 py-4">
          <p className="text-sm text-cine-muted">
            Titles are indexed, but this browser session has no files. Reconnect the folder to play.
          </p>
          <button
            type="button"
            className="mt-3 h-11 rounded-md bg-cine-cyan px-4 font-ui font-bold text-cine-bg"
            onClick={async () => {
              const n = await reconnectFolders();
              if (n) {
                useCinevo.setState({ localTitles: [...useCinevo.getState().localTitles] });
                setMessage(`Reconnected ${n} files.`);
              } else {
                fileRef.current?.click();
              }
            }}
          >
            Reconnect folders
          </button>
        </div>
      ) : null}

      {sources.length ? (
        <div className="space-y-2">
          <p className="font-ui text-xs font-semibold tracking-[0.1em] text-cine-cyan">ACTIVE SOURCES</p>
          {sources.map((s) => (
            <div key={s.id} className="glass flex items-center justify-between rounded-xl px-3 py-2">
              <div>
                <b className="font-ui capitalize">{s.name}</b>
                <p className="font-mono text-xs text-cine-faint">
                  {s.kind} · {s.count} titles {s.path ? `· ${s.path}` : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${s.name}`}
                className="flex size-11 items-center justify-center text-cine-muted hover:text-cine-danger"
                onClick={() => removeSource(s.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-cine-border px-4 py-5 text-sm text-cine-faint">
          Nothing added yet. Import Plex, Jellyfin, a folder, or a Node path.
        </p>
      )}

      {message ? <p className="text-sm text-cine-cyan">{message}</p> : null}
    </div>
  );
}

async function walkDir(dir: FileSystemDirectoryHandle, out: File[], prefix = "", depth = 0) {
  if (depth > 8 || out.length >= FOLDER_SCAN_CAP) return;
  // @ts-expect-error async iterator on directory handles
  for await (const entry of dir.values()) {
    if (out.length >= FOLDER_SCAN_CAP) return;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file") {
      if (!isVideoFile(entry.name)) continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      Object.defineProperty(file, "webkitRelativePath", { value: rel });
      out.push(file);
    } else if (entry.kind === "directory") {
      await walkDir(entry as FileSystemDirectoryHandle, out, rel, depth + 1);
    }
  }
}
