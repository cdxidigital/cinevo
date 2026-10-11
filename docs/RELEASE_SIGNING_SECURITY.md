# CINEVO release signing: security recovery

**Incident discovered 12 October 2026:** the public repository tracked Android
keystores and the Windows Node signing private key and PKCS#12 bundle. These are
compromised signing credentials, even after removal from the current branch,
because historical commits and any clones still contain them.

## Required owner action before the next public installer release

1. Treat every previously committed Android keystore and the Windows certificate
   private key as compromised. Do **not** reuse them for new installers.
2. Generate new signing credentials outside the repository using secure storage.
   Prefer a publicly trusted code-signing provider for Windows releases rather
   than a self-signed certificate. Store passwords in a secrets manager.
3. Rebuild, re-sign, test and replace all installer downloads before advertising
   the releases as trusted. Communicate Android signing-key changes: sideloaded
   APKs signed with a new key may require uninstall/reinstall; this can affect
   users' local app data. Existing APK signatures cannot be rotated by a Git
   commit alone.
4. Review release supply-chain access, package hashes and distribution history.
   Git history retains the exposed material. Coordinate any historical rewrite
   with existing clones/forks; history rewriting alone does not revoke a key.

## Signing environment

### Android remote

- CINEVO_REMOTE_KEYSTORE: absolute path outside source control
- CINEVO_REMOTE_KEYSTORE_PASSWORD: keystore password
- CINEVO_REMOTE_KEY_PASSWORD: key password
- CINEVO_REMOTE_KEY_ALIAS: optional, defaults to cinevo

### Android TV

- CINEVO_TV_KEYSTORE: absolute path outside source control
- CINEVO_TV_KEYSTORE_PASSWORD: keystore password
- CINEVO_TV_KEY_PASSWORD: key password
- CINEVO_TV_KEY_ALIAS: optional, defaults to cinevo

### Windows Node

- CINEVO_WINDOWS_SIGNING_P12: absolute path to private PKCS#12
- CINEVO_WINDOWS_SIGNING_PASSWORD: certificate password
- CINEVO_WINDOWS_SIGNING_ALIAS: optional, defaults to cinevo

For local development packages **only**, CINEVO_ALLOW_UNSIGNED_BUILD=1 permits
an explicitly **unsigned** Windows build. Release signing fails closed when
credentials are absent. Do not publish unsigned development packages.

The repository checker, `node scripts/check-public-repo.mjs`, refuses tracked
private-key file types. CI also runs TypeScript, tests, lint and production build.

## Deployment and runtime testing limits

Build and unit tests do not validate the live Vercel deployment, OAuth broker,
private Plex/Jellyfin servers, DNS, remote mobile pairing or native Android
installation. Test those in a connected staging environment before promotion.
