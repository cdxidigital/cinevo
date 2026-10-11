#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_SDK_ROOT:-/tmp/android-sdk}"
BT="$SDK/build-tools/34.0.0"
JAR="$SDK/platforms/android-34/android.jar"
WORK="${TMPDIR:-/tmp}/cinevo-tv-apk"
OUT="$ROOT/../../public/installers/CINEVO-TV.apk"
rm -rf "$WORK"
mkdir -p "$WORK/classes" "$WORK/compiled"
"$BT/aapt2" compile --dir "$ROOT/res" -o "$WORK/compiled"
"$BT/aapt2" link \
  -o "$WORK/base.apk" \
  -I "$JAR" \
  --manifest "$ROOT/AndroidManifest.xml" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  "$WORK/compiled/"*.flat
javac --release 17 -classpath "$JAR" -d "$WORK/classes" "$ROOT/src/me/cinevo/tv/MainActivity.java"
"$BT/d8" --min-api 24 --lib "$JAR" --output "$WORK" "$WORK/classes/me/cinevo/tv/"*.class
python3 - << PY
import zipfile
zipfile.ZipFile("$WORK/base.apk", "a").write("$WORK/classes.dex", "classes.dex")
PY
"$BT/zipalign" -p -f 4 "$WORK/base.apk" "$WORK/aligned.apk"
KEYSTORE="$ROOT/cinevo-tv.jks"
if [[ ! -f "$KEYSTORE" ]]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass cinevo-tv -keypass cinevo-tv \
    -alias cinevo -keyalg RSA -keysize 2048 -validity 3650 \
    -dname "CN=CINEVO TV, O=CINEVO, C=AU"
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:cinevo-tv --key-pass pass:cinevo-tv \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT" "$WORK/aligned.apk"
"$BT/apksigner" verify --verbose "$OUT"
echo "wrote $OUT"
