"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Printable QR code pointing customers at the walk-up farmstand page. */
export default function FarmstandQrCode() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || dataUrl) return;
    (async () => {
      let base = "";
      try {
        const res = await fetch("/api/settings/public");
        if (res.ok) base = (await res.json()).appUrl || "";
      } catch {}
      // Fall back to wherever the admin is browsing from
      const target = `${(base || window.location.origin).replace(/\/+$/, "")}/farmstand`;
      setUrl(target);
      setDataUrl(await QRCode.toDataURL(target, { width: 1024, margin: 2 }));
    })();
  }, [open, dataUrl]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
      >
        QR Code
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-stone-900">Farmstand QR Code</h2>
            <p className="text-xs text-stone-500">
              Print this and post it at the stand. Scanning opens the walk-up shop.
            </p>
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt="Farmstand QR code" className="w-full aspect-square" />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
              </div>
            )}
            <p className="text-xs font-mono text-stone-500 break-all">{url}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 border border-stone-300 text-stone-700 font-semibold text-sm px-4 py-2 rounded-lg"
              >
                Close
              </button>
              <a
                href={dataUrl ?? undefined}
                download="farmstand-qr.png"
                className={`flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg ${
                  dataUrl ? "" : "pointer-events-none opacity-50"
                }`}
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
