"use client";

import { useEffect } from "react";

let audio: AudioContext | undefined;

function unlockAudio() {
  if (typeof AudioContext === "undefined") return;
  audio ??= new AudioContext();
  if (audio.state === "suspended") void audio.resume().catch(() => {});
}

export function StaffAudio() {
  useEffect(() => {
    window.addEventListener("click", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    return () => {
      window.removeEventListener("click", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
  }, []);
  return null;
}

export function playOrderChime() {
  const context = audio;
  if (document.visibilityState !== "visible" || context?.state !== "running") return;
  const at = context.currentTime;
  const notes = [660, 880];
  notes.forEach((frequency, index) => {
    const start = at + index * 0.14;
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0, start);
    volume.gain.linearRampToValueAtTime(0.18, start + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
    tone.connect(volume).connect(context.destination);
    tone.start(start);
    tone.stop(start + 0.17);
  });
}
