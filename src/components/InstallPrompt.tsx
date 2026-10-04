"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { APK_URL } from "@/lib/app-links";

type Platform = "ios" | "android" | null;

const DISMISS_KEY = "daima-install-dismissed";
const listeners = new Set<() => void>();

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Which install offer suits this browser; null when already installed, dismissed, or on desktop. */
function detectPlatform(): Platform {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://");
  if (standalone || readDismissed()) return null;

  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so also check for touch.
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return null;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {}
  listeners.forEach((l) => l());
}

/**
 * Offers the app on phones: the APK on Android, an "Add to Home Screen" guide on iPhone and iPad.
 * Renders nothing on the server, on desktop, and inside the installed app.
 */
export function InstallPrompt() {
  const platform = useSyncExternalStore(subscribe, detectPlatform, () => null);
  const [guideOpen, setGuideOpen] = useState(false);

  if (!platform) return null;

  return (
    <>
      <div className="no-print fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Get the DAIMA Health app</p>
            <p className="text-xs text-muted">
              {platform === "ios" ? "Add it to your Home Screen in a few taps." : "Install the Android app for quicker access."}
            </p>
          </div>
          {platform === "ios" ? (
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Show me how
            </button>
          ) : (
            <a
              href={APK_URL}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              <Download className="h-4 w-4" aria-hidden /> Download
            </a>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-1 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
          className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="install-guide-title" className="text-base font-semibold">Add DAIMA Health to your Home Screen</h2>
              <button type="button" onClick={() => setGuideOpen(false)} aria-label="Close" className="rounded-md p-1 text-muted hover:text-foreground">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <ol className="mt-4 space-y-4 text-sm">
              <Step n={1}>
                Tap the <strong>Share</strong> button <Share className="inline h-4 w-4 align-text-bottom text-brand" aria-label="Share icon" /> in
                the browser toolbar. In Safari it is at the bottom of the screen (top right on iPad).
              </Step>
              <Step n={2}>
                Scroll down the list and tap <strong>Add to Home Screen</strong>{" "}
                <SquarePlus className="inline h-4 w-4 align-text-bottom text-brand" aria-label="Add icon" />.
              </Step>
              <Step n={3}>
                Tap <strong>Add</strong> in the top right corner. DAIMA Health now opens from its own icon, full screen.
              </Step>
            </ol>
            <p className="mt-4 rounded-lg bg-brand-soft p-3 text-xs text-brand-dark">
              Don&apos;t see &ldquo;Add to Home Screen&rdquo;? Open this page in Safari and try again.
            </p>
            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="mt-4 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
