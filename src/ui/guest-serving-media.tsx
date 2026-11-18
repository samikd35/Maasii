"use client";

/* eslint-disable react-hooks/set-state-in-effect -- Browser media/storage preferences are read after SSR hydration. */

import { useEffect, useRef, useState } from "react";
import { ServingPhoto } from "./serving-photo";

export const videoPreferenceKey = "maasii:automatic-video";

export function ServingMedia({ photoUrl, videoUrl, name, playLabel }: {
  photoUrl: string | null; videoUrl?: string | null; name: string; playLabel: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const automaticPause = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let allowed = !matchMedia("(prefers-reduced-motion: reduce)").matches && !connection?.saveData;
    try { allowed = allowed && sessionStorage.getItem(videoPreferenceKey) !== "off"; } catch { allowed = false; }
    if (allowed && videoUrl) setEnabled(true);
  }, [videoUrl]);
  useEffect(() => {
    const element = video.current;
    if (!element || !enabled) return;
    let visible = true;
    const resume = () => { if (visible && !document.hidden && !userPaused.current) void element.play().catch(() => {}); };
    const pause = () => { if (!element.paused) { automaticPause.current = true; element.pause(); } };
    const visibility = () => { if (document.hidden) pause(); else resume(); };
    const paused = () => { if (automaticPause.current) automaticPause.current = false; else userPaused.current = true; };
    const played = () => { userPaused.current = false; };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= 0.5; if (visible) resume(); else pause(); }, { threshold: 0.5 });
    observer.observe(element);
    element.addEventListener("canplay", resume);
    element.addEventListener("pause", paused);
    element.addEventListener("play", played);
    document.addEventListener("visibilitychange", visibility);
    resume();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); element.removeEventListener("canplay", resume); element.removeEventListener("pause", paused); element.removeEventListener("play", played); element.pause(); };
  }, [enabled, videoUrl, failed]);
  if (!photoUrl) return null;
  return <div className="relative overflow-hidden rounded-2xl bg-paper-deep">
    {videoUrl && enabled && !failed ? <video ref={video} src={videoUrl} poster={photoUrl} aria-label={name} muted playsInline controls loop preload="metadata" className="aspect-4/3 max-h-80 w-full object-contain" onError={() => setFailed(true)} /> : <>
      <ServingPhoto src={photoUrl} alt={name} decoding="async" className="aspect-4/3 max-h-80 w-full object-cover" />
      {videoUrl && !failed && <button type="button" className="maasii-button absolute bottom-3 left-3" onClick={() => setEnabled(true)}>{playLabel}</button>}
    </>}
  </div>;
}

export function VideoPreference({ label, hint }: { label: string; hint: string }) {
  const [enabled, setEnabled] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { try { setEnabled(sessionStorage.getItem(videoPreferenceKey) !== "off"); } catch { setEnabled(false); setUnavailable(true); } }, []);
  return <div className="maasii-card mt-5"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={enabled} disabled={unavailable} onChange={event => { const value = event.target.checked; try { sessionStorage.setItem(videoPreferenceKey, value ? "on" : "off"); setEnabled(value); } catch { setEnabled(false); setUnavailable(true); } }} />{label}</label><p className="text-sm text-ink-muted">{hint}</p></div>;
}
