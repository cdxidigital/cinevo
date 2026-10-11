# CINEVO Audit Status | 12 October 2026

Target: `https://cinevo.fourtee2.digital`
Repository: `cdxidigital/cinevo`
Audit branch: `fix/security-audit-20261012`
Pull request: https://github.com/cdxidigital/cinevo/pull/2

## Evidence and verification boundaries

The source tree was reviewed through an authenticated GitHub connection.
Security and reliability patches are staged in the audit branch.
The following **targeted isolated local tests** passed:

- Range parser: 14 tests passed
- Resolved-IP filter: 11 tests passed
- WebAuthn crypto checks: 8 passed (3 existing, 5 new rejection tests)
- Total isolated helper and WebAuthn tests: **33 passed, zero failures**
- Source-inventory check: all 24 test paths explicitly named in `npm test` exist
- Node integration suite test harness: isolated test ports and test-only configuration directories; corrected expected foreign-origin response code. Full Node integration run is still outstanding.

These are tests of isolated copies of helper logic, **not a whole-repository
`npm test` result**. The repository could not be cloned or dependencies
installed in the local execution environment, which has no outbound network.

The GitHub Actions job `Cinevo quality and security` still fails before
running any executable test step, returning no step list or retrievable job logs.
The check-run metadata reports two annotations, but the connected GitHub tool
cannot retrieve their contents. Its cause is
not proven. This cannot be represented as an ESLint, TypeScript, npm, or
application-test failure, because those steps did not report running.

The production domain was not accessible to the available web inspection
tools. Authentication against the real broker, private Plex/Jellyfin playback,
desktop and mobile browser UI, remote pairing across physical devices,
native APK install, signing and signing rotation remain **unverified**.

## Changes staged in PR #2

- Removed historical signing-key material from the current tree. Earlier
  Git history still exposes those keys; rotations remain necessary.
- Native installer binaries were removed from the proposed release.
  Download screens explain the security hold. Source builds remain.
- Native signing scripts now require signing material outside the repository;
  unsigned Windows builds require an explicit development-only flag.
- Added source signing-material guard plus GitHub Actions checks for build,
  typecheck, lint and application tests.
- Protected CINEVO Node's admin UI, local-only settings, pair rate limits
  and browser-origin access. Updated its integration tests to use separate
  ports and test configuration, and to expect HTTP 403 for forbidden origins.
- Corrected byte-range and HEAD responses, multi-folder preservation,
  and symlink escapes outside approved media folders.
- Blocked known private/metadata cloud egress destinations, added DNS-IP
  checks and blocked credential-bearing cross-origin redirects.
- Hardened WebAuthn relying-party origin checks and blocked unauthenticated
  email-claim passkey enrollment and cross-provider unverified linking.
  Added tested rejection cases for replay, origin mismatch, RP-hash mismatch,
  missing user presence and modified signatures.
- Made QR login approval single-use with an atomic claim.
- Cleared previous-account browser data on identity changes.
- Protected AI attendant requests with authentication, persisted consent,
  per-user hourly quota and disabled paid AI by default.
- Gave concurrent Plex/Jellyfin streams unique upstream session IDs.
- Routed LAN Node playback away from the cloud and surfaced the requirement
  for secure HTTPS access where browser mixed-content policy applies.
- Integrated the newer PWA naming change from main.

## Release acceptance gates (all required)

- [ ] GitHub Actions runners actually execute jobs and publish logs
- [ ] `npm ci`, `npm run typecheck`, `npm test`, `npm run lint`,
      `npm run build` all pass on the audit head
- [ ] Development AND production browser smoke tests on desktop and mobile
      pass, with zero uncaught console errors
- [ ] Real public-domain login, logout, email and OAuth journeys verified
- [ ] WebAuthn enrollment, sign-in, QR login and account isolation tested
      against the actual deployed database
- [ ] Private Plex/Jellyfin connections, playback and artwork work in a
      connected staging environment with representative media
- [ ] Node companion pairing, range seeking, local LAN, CORS and remote
      control tested on Windows/macOS/Linux/Android TV
- [ ] Security review of dynamic-DNS egress and Vercel edge firewall,
      rate limits, long-running transcoding, and secret storage
- [ ] Replacement trusted signing credentials are provisioned, old keys
      retired, native installers rebuilt and tested on real devices
- [ ] Final security regression test and deployment smoke test after merge

Do not merge as production-ready until these checks have evidence. Neither
source review nor isolated helper tests can establish that every production
issue has been resolved.
