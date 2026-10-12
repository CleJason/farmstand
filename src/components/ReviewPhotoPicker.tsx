"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

const MAX = 4;

/**
 * Add up to 4 photos to a review. Customers upload with their review link's
 * token; admins upload as themselves. In preview mode nothing is uploaded.
 */
export default function ReviewPhotoPicker({
  images,
  onChange,
  reviewToken,
  preview = false,
  label = "Add photos (optional)",
}: {
  images: string[];
  onChange: (images: string[]) => void;
  reviewToken?: string;
  preview?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setUploading(true);
    const next = [...images];
    try {
      for (const file of Array.from(files).slice(0, MAX - images.length)) {
        if (preview) {
          next.push(URL.createObjectURL(file));
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        if (reviewToken) form.append("reviewToken", reviewToken);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't upload that photo");
        next.push(data.url);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      onChange(next);
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <span className="block text-xs font-medium text-stone-600 mb-1">{label}</span>
      <div className="flex flex-wrap gap-2">
        {images.map((src) => (
          <div key={src} className="relative w-20 h-20 rounded-lg overflow-hidden border border-stone-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(images.filter((i) => i !== src))}
              aria-label="Remove photo"
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-white/90 text-stone-700"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {images.length < MAX && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => input.current?.click()}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-stone-300 text-stone-500 text-xs hover:border-amber-500 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "+ Photo"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        // Specific types make iPhones convert HEIC photos to JPEG
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
