import type { CoreTab, Room } from "./cinevo-store";

export const APP_ROOMS = ["movies", "shows", "library", "tools", "browse"] as const;
export type AppRoomParam = (typeof APP_ROOMS)[number];

export const APP_CORES = ["libraries", "sharing", "stewardship", "ai"] as const;
export type AppCoreParam = (typeof APP_CORES)[number];

export type AppDestination = {
  room?: AppRoomParam;
  core?: AppCoreParam;
  title?: string;
  watch?: string;
};

const SEAT = /^[\w:./~+-]{1,200}$/;

export function seatId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return SEAT.test(id) ? id : undefined;
}

export function appDestination(search: Record<string, unknown>): AppDestination {
  const room = APP_ROOMS.includes(search.room as AppRoomParam) ? (search.room as AppRoomParam) : undefined;
  const core = APP_CORES.includes(search.core as AppCoreParam) ? (search.core as AppCoreParam) : undefined;
  const title = seatId(search.title);
  const watch = seatId(search.watch);
  return {
    ...(room ? { room } : {}),
    ...(core ? { core } : {}),
    ...(title && title !== watch ? { title } : {}),
    ...(watch ? { watch } : {}),
  };
}

export function roomFromParam(room: AppRoomParam | undefined): Room | undefined {
  if (!room) return undefined;
  if (room === "library") return "sidebar";
  return room;
}

export function paramFromRoom(room: Room): AppRoomParam | undefined {
  if (room === "stage") return undefined;
  if (room === "sidebar") return "library";
  return room;
}

export function isRoom(value: unknown): value is Room {
  return value === "stage" || value === "browse" || value === "movies" || value === "shows" || value === "sidebar" || value === "tools";
}
