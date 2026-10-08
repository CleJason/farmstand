"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

const DISMISS_KEY = "install-prompt-dismissed";

/**
 * Registers the service worker and offers "Install app" on phones:
 * Android/Chrome uses the native prompt; iPhone Safari gets Share → Add to Home Screen steps.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && isSafari) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  if (dismissed || !pathname?.startsWith("/admin")) return null;
  if (!deferred && !showIosHint) return null;

  return (
    <div className="fixed bottom-3 inset-x-3 z-50 mx-auto max-w-md bg-white border border-stone-200 shadow-lg rounded-2xl p-4 flex items-start gap-3">
      <div className="flex-1 text-sm">
        <p className="font-semibold text-stone-900">Install the app</p>
        {deferred ? (
          <p className="text-stone-500 text-xs mt-0.5">Add admin to your home screen for quick access to orders.</p>
        ) : (
          <p className="text-stone-500 text-xs mt-0.5">
            Tap the Share button <span aria-hidden>⬆️</span>, then <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
      {deferred && (
        <button
          onClick={async () => {
            await deferred.prompt();
            setDeferred(null);
          }}
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg shrink-0"
        >
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="text-stone-400 hover:text-stone-600 text-lg leading-none px-1">
        ×
      </button>
    </div>
  );
}
