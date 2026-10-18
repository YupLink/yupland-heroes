import { useEffect, useRef, type CSSProperties } from "react";
import type { SlotState } from "@/lib/slot/state";
import type { ClientAction } from "@/lib/slot/serverStep";

export type Act = (
  action: ClientAction,
) => Promise<{ state: SlotState; gold: number } | null>;
export type SceneProps = {
  state: SlotState;
  act: Act;
  ru: boolean;
  acting: boolean;
};
export const asset = (name: string) => "/slot/cabinet/assets/" + name;
export const vars = (value: Record<string, string | number>) =>
  value as CSSProperties;
export const num = (n: number, ru = true) =>
  n.toLocaleString(ru ? "ru-RU" : "en-US");
export const text = (ru: boolean, a: string, b: string) => (ru ? a : b);

/** Cancellable presentation waits. They never determine a game outcome. */
export function useTimeline() {
  const epoch = useRef(0),
    timers = useRef(new Map<number, (ok: boolean) => void>());
  useEffect(
    () => () => {
      epoch.current++;
      timers.current.forEach((done, id) => {
        clearTimeout(id);
        done(false);
      });
      timers.current.clear();
    },
    [],
  );
  return {
    cancel: () => {
      epoch.current++;
      timers.current.forEach((done, id) => {
        clearTimeout(id);
        done(false);
      });
      timers.current.clear();
    },
    wait: (ms: number, reading = false) =>
      new Promise<boolean>((done) => {
        const generation = epoch.current;
        const duration =
          !reading && matchMedia("(prefers-reduced-motion:reduce)").matches
            ? 0
            : ms;
        const id = window.setTimeout(() => {
          timers.current.delete(id);
          done(generation === epoch.current);
        }, duration);
        timers.current.set(id, done);
      }),
  };
}
