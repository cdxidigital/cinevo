import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const refreshLibraryArt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      provider: "plex" | "jellyfin";
      uri: string;
      token: string;
      clientId?: string;
      userServerId?: string;
      keys: string[];
      ticket?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { refreshArtwork } = await import("./artwork.server");
    return refreshArtwork({ ...data, userId: context.userId });
  });
