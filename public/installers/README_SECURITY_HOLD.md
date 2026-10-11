# CINEVO native release security hold
The packages previously published under this directory were removed from
the pending audited release because the repository contained exposed signing
credentials. Old Git history still includes the signing materials. Assume
these signing identities cannot be trusted.

No installer should be republished until its signing certificate / Android
keystore has been rotated and the signed binary has been independently tested
on target platforms. Build sources are retained.
See docs/RELEASE_SIGNING_SECURITY.md in the repository.
