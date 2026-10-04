// Where the installable versions of the app live. The Android APK is built by
// .github/workflows/android.yml and attached to the newest GitHub release.
export const GITHUB_REPO = "immanuellangat/daima-hms";
export const APK_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/daima-health.apk`;
export const INSTALL_PAGE_URL = "https://immanuellangat.github.io/daima-hms/";

// Must match applicationId in android/app/build.gradle.
export const ANDROID_PACKAGE = "io.github.immanuellangat.daima";
