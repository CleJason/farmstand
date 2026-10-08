"use client";

import { useRef } from "react";
import { DEFAULT_POSITION, formatPosition, parsePosition } from "@/lib/image-position";

/**
 * Square preview of a product photo that you drag to choose which part shows
 * (works with mouse and touch). Customers see the same square crop.
 */
export default function ImagePositioner({
  url,
  position,
  onChange,
}: {
  url: string;
  position: string | null;
  onChange: (position: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const current = parsePosition(position);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, ...current };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !frame.current) return;
    const size = frame.current.clientWidth;
    // Dragging the photo right reveals more of its left side, so the position moves the other way
    const dx = ((e.clientX - drag.current.startX) / size) * 100 * 1.5;
    const dy = ((e.clientY - drag.current.startY) / size) * 100 * 1.5;
    onChange(formatPosition(drag.current.x - dx, drag.current.y - dy));
  };

  const end = () => {
    drag.current = null;
  };

  return (
    <div className="space-y-1.5">
      <div
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        className="relative w-48 aspect-square rounded-xl overflow-hidden border border-stone-200 bg-stone-100 cursor-grab active:cursor-grabbing touch-none select-none mx-auto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          draggable={false}
          className="w-full h-full object-cover pointer-events-none"
          style={{ objectPosition: position || DEFAULT_POSITION }}
        />
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] font-medium bg-black/50 text-white rounded-full px-2 py-0.5 pointer-events-none">
          Drag to adjust
        </div>
      </div>
      <div className="text-center">
        <button type="button" onClick={() => onChange(DEFAULT_POSITION)} className="text-[11px] text-stone-500 underline">
          Center it
        </button>
      </div>
    </div>
  );
}
