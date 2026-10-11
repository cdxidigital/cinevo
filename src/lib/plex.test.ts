import assert from "node:assert/strict";
import test from "node:test";
import {
  connectionKind,
  isPlexServer,
  parsePlexMetadata,
  parsePlexResources,
  parsePlexSections,
  rankConnections,
  plexAuthUrl,
  type PlexConnection,
} from "./plex.ts";

test("plex approval link uses the hashbang route Plex actually reads", () => {
  const url = new URL(plexAuthUrl("client-1", "pin-code", "https://house.example/app"));
  assert.equal(url.origin + url.pathname, "https://app.plex.tv/auth/");
  assert.match(url.hash, /^#!\?/);
  const params = new URLSearchParams(url.hash.slice(3));
  assert.equal(params.get("clientID"), "client-1");
  assert.equal(params.get("code"), "pin-code");
  assert.equal(params.get("forwardUrl"), "https://house.example/app");
  assert.equal(params.get("context[device][product]"), "CINEVO");
});

test("filters plex.tv resources down to media servers", () => {
  const servers = parsePlexResources([
    { name: "Phone", provides: "client,player", clientIdentifier: "phone" },
    {
      name: "Home NAS",
      provides: "server",
      clientIdentifier: "nas-1",
      owned: true,
      accessToken: "tok-home",
      connections: [
        { uri: "https://relay.plex.direct:443", relay: true, local: false, protocol: "https" },
        { uri: "https://192-168-1-10.abc.plex.direct:32400", local: true, relay: false, protocol: "https" },
        { uri: "https://home.example.net:32400", local: false, relay: false, protocol: "https" },
      ],
    },
    {
      name: "Friend’s Plex",
      product: "Plex Media Server",
      clientIdentifier: "friend-1",
      owned: false,
      accessToken: "tok-share",
      connections: [{ uri: "https://friend.plex.direct:443", local: false, relay: true, protocol: "https" }],
    },
  ]);
  assert.equal(servers.length, 2);
  assert.equal(servers[0].name, "Home NAS");
  assert.equal(servers[0].owned, true);
  assert.equal(servers[1].owned, false);
  assert.equal(servers[0].connections.length, 3);
});

test("ranks local https ahead of remote and relay", () => {
  const ranked = rankConnections([
    { uri: "https://relay", local: false, relay: true, protocol: "https", address: "", port: 443 },
    { uri: "https://remote", local: false, relay: false, protocol: "https", address: "", port: 32400 },
    { uri: "https://lan", local: true, relay: false, protocol: "https", address: "", port: 32400 },
    { uri: "http://lan", local: true, relay: false, protocol: "http", address: "", port: 32400 },
  ] satisfies PlexConnection[]);
  assert.equal(ranked[0].uri, "https://lan");
  assert.equal(ranked[1].uri, "http://lan");
  assert.equal(ranked[2].uri, "https://remote");
  assert.equal(ranked[3].uri, "https://relay");
  assert.equal(connectionKind(ranked[0]), "Local");
  assert.equal(connectionKind(ranked[2]), "Remote");
  assert.equal(connectionKind(ranked[3]), "Relay");
});

test("parses library sections and metadata", () => {
  const sections = parsePlexSections({
    MediaContainer: {
      Directory: [
        { key: "1", title: "Movies", type: "movie", size: 42 },
        { key: "2", title: "TV", type: "show" },
      ],
    },
  });
  assert.deepEqual(
    sections.map((s) => s.title),
    ["Movies", "TV"],
  );
  const titles = parsePlexMetadata(
    {
      MediaContainer: {
        Metadata: [
          { ratingKey: "99", title: "Heat", year: 1995, type: "movie", summary: "LA.", Genre: [{ tag: "Crime" }] },
          { ratingKey: "100", title: "The Bear", year: 2022, type: "show" },
        ],
      },
    },
    "Home NAS",
  );
  assert.equal(titles[0].id, "plex-99");
  assert.equal(titles[0].ratingKey, "99");
  assert.equal(titles[0].genre, "Crime");
  assert.equal(titles[1].kind, "series");
  assert.equal(titles[1].sourceLabel, "Home NAS");
  const episode = parsePlexMetadata(
    {
      MediaContainer: {
        Metadata: [
          {
            ratingKey: "101",
            type: "episode",
            title: "Rain",
            grandparentTitle: "Show",
            parentIndex: 1,
            index: 2,
            Media: [{ Part: [{ file: "/volume1/media/Shows/Show/Season 01/rain.mkv" }] }],
          },
        ],
      },
    },
    "NAS",
  );
  assert.equal(episode[0].title, "Show · S01E02 · Rain");
  assert.equal(episode[0].folder, "volume1/media/Shows/Show/Season 01");
  assert.equal(episode[0].ratingKey, "101");
});

test("isPlexServer reads comma provides", () => {
  assert.equal(isPlexServer({ provides: "server" }), true);
  assert.equal(isPlexServer({ provides: "client, server" }), true);
  assert.equal(isPlexServer({ provides: "player" }), false);
});
