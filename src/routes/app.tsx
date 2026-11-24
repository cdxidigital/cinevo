import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Shell } from "@/components/cinevo/shell";
import { RoomSwitch } from "@/components/cinevo/rooms";
import {
  Toast,
} from "@/components/cinevo/overlays";
import { Player } from "@/components/cinevo/player";
import { CastSheet } from "@/components/cinevo/cast-sheet";
import { Keys } from "@/components/cinevo/keys";
import { RemoteBridge } from "@/components/cinevo/remote-bridge";
import { Logo } from "@/components/cinevo/logo";
import { appDestination, paramFromRoom, roomFromParam } from "@/lib/app-destination";
import { useCinevo } from "@/lib/cinevo-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { authClient, getBearerToken } from "@/lib/auth/client";

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>) => appDestination(search),
  component: Cinema,
});

function AppSkeleton() {
  return (
    <div className="cinevo-house min-h-screen bg-cine-bg text-cine-text">
      <header className="top-nav">
        <span className="top-nav__brand">
          <Logo size="sm" tagline={false} />
        </span>
      </header>
      <div className="px-[max(5vw,1.25rem)] py-24">
        <div className="h-3 w-28 animate-pulse rounded bg-cine-surface" />
        <div className="mt-4 h-12 w-64 max-w-full animate-pulse rounded bg-cine-surface" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-cine-surface" />
        <div className="mt-8 h-11 w-40 animate-pulse rounded-md bg-cine-surface" />
      </div>
    </div>
  );
}

function Cinema() {
  const { user, isPending } = useCurrentUserState();
  const sessionRetry = useRef(false);
  const room = useCinevo((s) => s.room);
  const setRoom = useCinevo((s) => s.setRoom);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const openTitle = useCinevo((s) => s.openTitle);
  const closeTitle = useCinevo((s) => s.closeTitle);
  const play = useCinevo((s) => s.play);
  const stopPlay = useCinevo((s) => s.stopPlay);
  const search = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    const state = useCinevo.getState();
    const next = roomFromParam(search.room);
    if (next && next !== state.room) setRoom(next);
    if (search.core) {
      if (!state.coreOpen || state.coreTab !== search.core) setCoreOpen(true, search.core);
    } else if (state.coreOpen) {
      setCoreOpen(false);
    }
    const latest = useCinevo.getState();
    if (search.watch) {
      if (latest.playingId !== search.watch) play(search.watch);
      if (latest.selectedId) closeTitle();
    } else if (latest.playingId) {
      stopPlay();
    }
    const afterPlay = useCinevo.getState();
    if (!search.watch && search.title) {
      if (afterPlay.selectedId !== search.title) openTitle(search.title);
    } else if (afterPlay.selectedId) {
      closeTitle();
    }
  }, [search.room, search.core, search.title, search.watch, setRoom, setCoreOpen, openTitle, closeTitle, play, stopPlay]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("cinevo-tv") === "1") document.documentElement.dataset.tv = "1";
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let queued = false;
    return useCinevo.subscribe((state, prev) => {
      if (
        state.room === prev.room &&
        state.coreOpen === prev.coreOpen &&
        state.coreTab === prev.coreTab &&
        state.selectedId === prev.selectedId &&
        state.playingId === prev.playingId
      ) {
        return;
      }
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const latest = useCinevo.getState();
        const room = paramFromRoom(latest.room);
        const core = latest.coreOpen && latest.coreTab !== "operations" ? latest.coreTab : undefined;
        const watch = latest.playingId || undefined;
        const title = !watch && latest.selectedId ? latest.selectedId : undefined;
        void navigate({
          to: "/app",
          search: {
            ...(room ? { room } : {}),
            ...(core ? { core } : {}),
            ...(title ? { title } : {}),
            ...(watch ? { watch } : {}),
          },
          replace: true,
        });
      });
    });
  }, [navigate]);

  if (isPending) return <AppSkeleton />;
  if (!user && getBearerToken() && !sessionRetry.current) {
    sessionRetry.current = true;
    void authClient.getSession();
    return <AppSkeleton />;
  }
  if (!user) {
    return (
      <Navigate
        to="/login"
        search={{
          mode: "in",
          ...(search.room ? { room: search.room } : {}),
          ...(search.core ? { core: search.core } : {}),
          ...(search.title ? { title: search.title } : {}),
          ...(search.watch ? { watch: search.watch } : {}),
        }}
      />
    );
  }

  return (
    <Shell
      overlays={
        <>
          <Player />
          <CastSheet />
          <Toast />
        </>
      }
    >
      <Keys />
      <RemoteBridge />
      <RoomSwitch room={room} />
    </Shell>
  );
}
