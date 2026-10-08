"use client";

import { useState, useRef } from "react";
import Image from "next/image";

interface ImageUploadProps {
  currentUrl: string | null;
  onUpload: (url: string) => void;
  accept?: string;
  hint?: string;
  /** "contain" shows the whole image (icons/logos) instead of cropping */
  fit?: "cover" | "contain";
}

export default function ImageUpload({
  currentUrl,
  onUpload,
  accept = "image/jpeg,image/png,image/webp,image/gif,image/avif",
  hint = "JPG, PNG, WebP · Max 10MB",
  fit = "cover",
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setPreview(data.url);
      onUpload(data.url);
    } catch (err: any) {
      setError(err.message);
      setPreview(currentUrl);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  };

  return (
    <div className="space-y-2">
      <div
        onClick={() => inputRef.current?.click()}
        className="relative w-full h-40 rounded-xl border-2 border-dashed border-stone-300 hover:border-amber-400 bg-stone-50 hover:bg-amber-50/30 flex items-center justify-center cursor-pointer transition-all duration-200 overflow-hidden group"
      >
        {preview ? (
          <>
            <Image
              src={preview}
              alt="Product"
              fill
              unoptimized
              className={fit === "contain" ? "object-contain p-6" : "object-cover"}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {uploading ? "Uploading..." : "Click to change"}
              </span>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="text-3xl mb-1">{uploading ? "⏳" : "📷"}</div>
            <p className="text-xs text-stone-500 font-medium">
              {uploading ? "Uploading..." : "Click to upload photo"}
            </p>
            <p className="text-[10px] text-stone-400 mt-0.5">
              {hint}
            </p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
}
