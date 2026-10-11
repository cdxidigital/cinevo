import { useEffect, useRef } from "react";
import { artProxyUrl } from "@/lib/artwork-model";
import { refreshLibraryArt } from "@/lib/artwork";
import { useCinevo } from "@/lib/cinevo-store";
import { loadThumbs } from "@/lib/folder-handles";

function libraryStamp(titles: { id: string }[]) {
  let hash = titles.length;
  for (let i = 0; i < titles.length; i += 1) {
    const id = titles[i].id;
    hash = (hash * 33 + id.length + (id.charCodeAt(0) || 0) + (id.charCodeAt(id.length - 1) || 0)) >>> 0;
  }
  return String(hash);
}

function sameLibrary(sourceName: string, label: string) {
  if (label === sourceName) return true;
  const handle = sourceName.replace(/^@/, "");
  return label.startsWith(`${handle} ·`) || label.startsWith(`${sourceName} ·`);
}

export function ArtworkSync() {
  const hydrated = useCinevo((s) => s.hydrated);
  const sources = useCinevo((s) => s.sources);
  const remote = useCinevo((s) => s.remoteTitles);
  const local = useCinevo((s) => s.localTitles);
  const clientId = useCinevo((s) => s.plexClientId);
  const remoteKey = libraryStamp(remote);
  const localKey = libraryStamp(local);
  const ranRemote = useRef("");
  const ranLocal = useRef("");

  useEffect(() => {
    if (!hydrated || !local.length || ranLocal.current === localKey) return;
    ranLocal.current = localKey;
    void loadThumbs(useCinevo.getState().localTitles.map((title) => title.id)).then((saved) => {
      useCinevo.getState().patchArtwork(Object.entries(saved).map(([id, url]) => ({ id, poster: url, still: url })));
    });
  }, [hydrated, localKey]);

  useEffect(() => {
    if (!hydrated || !remoteKey || ranRemote.current === remoteKey) return;
    ranRemote.current = remoteKey;
    const titles = useCinevo.getState().remoteTitles;
    const targets = sources.filter((source) => (source.kind === "plex" || source.kind === "jellyfin") && source.baseUrl && source.accessToken);
    void (async () => {
      for (const source of targets) {
        const keys = titles
          .filter((title) => title.source === source.kind && sameLibrary(source.name, title.sourceLabel))
          .map((title) => title.path || title.id)
          .filter(Boolean);
        if (!keys.length || !source.baseUrl || !source.accessToken) continue;
        let ticket = "";
        const gathered: {
          id: string;
          poster?: string;
          still?: string;
          showPoster?: string;
          synopsis?: string;
          year?: string;
          runtime?: string;
          rating?: number;
          genre?: string;
          genres?: string[];
          cast?: string[];
          director?: string;
          studio?: string;
          contentRating?: string;
          writers?: string[];
        }[] = [];
        for (let index = 0; index < keys.length; index += 60) {
          const slice = keys.slice(index, index + 60);
          try {
            const res = await refreshLibraryArt({
              data: {
                provider: source.kind === "jellyfin" ? "jellyfin" : "plex",
                uri: source.baseUrl,
                token: source.accessToken,
                clientId: clientId || "cinevo-web",
                userServerId: source.userId,
                keys: slice,
                ticket: ticket || undefined,
              },
            });
            if (!res.ok) continue;
            ticket = res.ticket;
            gathered.push(
              ...res.items.map((item) => ({
                id: item.id,
                poster: item.posterPath ? artProxyUrl(res.ticket, item.posterPath) : undefined,
                still: item.stillPath ? artProxyUrl(res.ticket, item.stillPath) : undefined,
                showPoster: item.showPosterPath ? artProxyUrl(res.ticket, item.showPosterPath) : undefined,
                synopsis: item.synopsis,
                year: item.year,
                runtime: item.runtime,
                rating: item.rating,
                genre: item.genre,
                genres: item.genres,
                cast: item.cast,
                director: item.director,
                studio: item.studio,
                contentRating: item.contentRating,
                writers: item.writers,
              })),
            );
          } catch {
            /* this page of the library did not answer */
          }
        }
        if (gathered.length) useCinevo.getState().patchArtwork(gathered);
      }
    })();
  }, [clientId, hydrated, remoteKey, sources]);

  return null;
}
