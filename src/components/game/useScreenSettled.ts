// Экран готов, когда он нарисован целиком, а не когда пришли данные.
//
// Карта: кадр нарисован, статика допечена, разведанное пришло с сервера, все
// картинки, что попросил кадр, догрузились. Замок: его картинки. И там и там —
// значки интерфейса (<img> на экране) и шрифты. Всё это должно простоять тихо
// QUIET_MS: последняя картинка будит ещё один кадр, и он может попросить новые.
//
// Потолок CAP_MS — от прихода данных: на медленном канале картинки качаются
// десятки секунд, и запирать вход дольше честнее не стоит — заставка через 15 с
// и так предложит обновить игру.
import { useEffect, useState } from "react";
import { imagesInFlight } from "@/components/beta-raid/imageQueue";
import { settleSignals } from "./settleSignals";

const POLL_MS = 100;
const QUIET_MS = 300;
const CAP_MS = 12_000;

export type SettleKind = "raid" | "castle";

type Doc = Pick<Document, "images" | "defaultView" | "fonts"> | undefined;

/** Значки интерфейса на экране, которые ещё качаются. Своя заставка не в счёт. */
export function domImagesPending(doc: Doc = globalThis.document): number {
  if (!doc) return 0;
  let n = 0;
  const w = doc.defaultView?.innerWidth ?? 0;
  const h = doc.defaultView?.innerHeight ?? 0;
  for (const img of Array.from(doc.images)) {
    if (img.complete || img.loading === "lazy" || img.closest(".game-load-state")) continue;
    const r = img.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom < 0 || r.right < 0 || r.top > h || r.left > w) continue;
    n++;
  }
  return n;
}

function fontsLoaded(doc: Doc): boolean {
  return !doc?.fonts || doc.fonts.status === "loaded";
}

/** Тихо ли сейчас на экране: всё нарисовано и ничего не качается. */
export function screenQuiet(kind: SettleKind, doc: Doc = globalThis.document): boolean {
  const s = settleSignals();
  const own =
    kind === "raid"
      ? s.frames > 0 && !s.baking && s.fogPulled && imagesInFlight() === 0
      : s.castleArt;
  return own && domImagesPending(doc) === 0 && fontsLoaded(doc);
}

/** true, когда экран дорисован; дальше не сбрасывается — тёплый экран готов сразу. */
export function useScreenSettled(kind: SettleKind, dataReady: boolean): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!dataReady || settled) return;
    const start = performance.now();
    let quietSince: number | null = null;
    const id = window.setInterval(() => {
      const now = performance.now();
      if (!screenQuiet(kind)) quietSince = null;
      else quietSince ??= now;
      const quiet = quietSince !== null && now - quietSince >= QUIET_MS;
      if (quiet || now - start >= CAP_MS) setSettled(true);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [kind, dataReady, settled]);
  return settled;
}
