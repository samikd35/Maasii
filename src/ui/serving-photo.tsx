"use client";

import { useState, type ImgHTMLAttributes } from "react";

export function ServingPhoto(props: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState<string>();
  if (!props.src || failed === props.src) return <span className={`${props.className ?? "dish-placeholder"} flex items-center justify-center bg-paper-deep text-ink-muted`} aria-hidden>◇</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ""} onError={() => setFailed(String(props.src))} />;
}
