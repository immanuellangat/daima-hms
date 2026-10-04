import { ANDROID_PACKAGE } from "@/lib/app-links";

// Digital Asset Links: proves the Android app and this site belong together, so the
// app opens full screen without a browser address bar. ANDROID_CERT_SHA256 is the
// SHA-256 fingerprint of the APK signing key (comma-separated if there are several).
export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const statements = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];

  return Response.json(statements);
}
