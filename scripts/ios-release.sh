#!/usr/bin/env bash
# Builds, signs and uploads the iOS app to App Store Connect (TestFlight).
#
# Required environment:
#   APPLE_TEAM_ID   Apple Developer team id; default 3LCA4AA483 (Parv Jain)
#   ASC_ISSUER_ID   App Store Connect API issuer id; default is the Parv Jain team (from Users and
#                   Access -> Integrations -> App Store Connect API)
# Optional:
#   ASC_KEY_ID      API key id; default F8R2VL5ARJ. The matching
#                   AuthKey_<id>.p8 must be in ~/.appstoreconnect/private_keys
#   BUILD_NUMBER    CFBundleVersion for this upload; default: next number after
#                   the highest build already on App Store Connect for this
#                   version, falling back to 1
#   SKIP_UPLOAD=1   archive + export only
#
# Signing is fully automatic: xcodebuild uses the API key to register the
# bundle id, create a cloud-managed "Apple Distribution" certificate and the
# App Store provisioning profile on first run.
set -euo pipefail

cd "$(dirname "$0")/../ios"
export LANG=en_US.UTF-8

APPLE_TEAM_ID="${APPLE_TEAM_ID:-3LCA4AA483}"   # Parv Jain
ASC_ISSUER_ID="${ASC_ISSUER_ID:-cf6cea60-e843-4c8c-bb15-d38350fe10c4}"
ASC_KEY_ID="${ASC_KEY_ID:-F8R2VL5ARJ}"
KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
[ -f "$KEY_PATH" ] || { echo "missing $KEY_PATH" >&2; exit 1; }

OUT="$PWD/build/release"
ARCHIVE="$OUT/ugcapp.xcarchive"
mkdir -p "$OUT"

AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$KEY_PATH"
      -authenticationKeyID "$ASC_KEY_ID"
      -authenticationKeyIssuerID "$ASC_ISSUER_ID")

BUILD_NUMBER="${BUILD_NUMBER:-}"
if [ -z "$BUILD_NUMBER" ]; then
  # Ask App Store Connect for the highest build number already uploaded so the
  # upload is never rejected as a duplicate.
  BUILD_NUMBER="$(ASC_KEY_ID="$ASC_KEY_ID" ASC_ISSUER_ID="$ASC_ISSUER_ID" \
    node "$(dirname "$0")/../scripts/asc-next-build.mjs" io.ugcad.app 2>/dev/null || echo 1)"
fi
echo "==> Build number: $BUILD_NUMBER"

[ -d Pods ] || pod install

echo "==> Archiving"
xcodebuild -workspace ugcapp.xcworkspace -scheme ugcapp -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  "${AUTH[@]}" archive | tee "$OUT/archive.log" | grep -E "error:|warning: .*deprecated|\*\* ARCHIVE" || true
grep -q "ARCHIVE SUCCEEDED" "$OUT/archive.log" || { echo "archive failed, see $OUT/archive.log" >&2; exit 1; }

echo "==> Exporting signed .ipa"
sed "s/\$(APPLE_TEAM_ID)/$APPLE_TEAM_ID/" ExportOptions.plist > "$OUT/ExportOptions.plist"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$OUT" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" "${AUTH[@]}" | tee "$OUT/export.log" | grep -E "error:|EXPORT" || true
IPA="$(ls "$OUT"/*.ipa | head -1)"
[ -f "$IPA" ] || { echo "export failed, see $OUT/export.log" >&2; exit 1; }
echo "==> $IPA"

if [ "${SKIP_UPLOAD:-0}" = "1" ]; then exit 0; fi

echo "==> Validating"
xcrun altool --validate-app -f "$IPA" -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
echo "==> Uploading"
xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
echo "==> Uploaded build $BUILD_NUMBER. It appears in TestFlight after Apple finishes processing (usually 5-15 min)."
