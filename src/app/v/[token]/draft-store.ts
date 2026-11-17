import { useSyncExternalStore } from "react";
import type { DraftLine } from "@/core/browser";

export type Line = DraftLine & { lineId: string };
export const draftKey = (venueLinkToken: string) => `maasii:draft:${venueLinkToken}`;

const noLines: Line[] = [];
const readNoLines = () => noLines;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string; lines: Line[]; unsaved?: boolean }>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readDraft(key: string): Line[] {
  const entry = cache.get(key);
  if (entry?.unsaved) return entry.lines;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      cache.delete(key);
      return noLines;
    }
    if (raw === entry?.raw) return entry.lines;
    const lines = parseDraft(raw);
    cache.set(key, { raw, lines });
    return lines;
  } catch {
    return entry?.lines ?? noLines;
  }
}

export function useDraft(key?: string) {
  return useSyncExternalStore(subscribe, key === undefined ? readNoLines : () => readDraft(key), readNoLines);
}

export function hasUnsavedDraft(key: string) {
  return cache.get(key)?.unsaved === true;
}

export function writeDraft(key: string, lines: Line[]) {
  const raw = JSON.stringify(lines);
  let unsaved = false;
  try {
    localStorage.setItem(key, raw);
  } catch {
    unsaved = true;
  }
  cache.set(key, { raw, lines, unsaved });
  listeners.forEach((listener) => listener());
}

function parseDraft(raw: string | null): Line[] {
  if (!raw) return noLines;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isLine) : noLines;
  } catch {
    return noLines;
  }
}

function isLine(value: unknown): value is Line {
  const line = value as Partial<Record<keyof Line, unknown>> | null;
  return (
    typeof line?.lineId === "string" &&
    typeof line.dishId === "string" &&
    typeof line.dishName === "string" &&
    typeof line.quantity === "number" &&
    typeof line.note === "string" &&
    Array.isArray(line.choices) &&
    line.choices.every((choice: { choiceId?: unknown; name?: unknown } | null) =>
      typeof choice?.choiceId === "string" && typeof choice.name === "string",
    )
  );
}
