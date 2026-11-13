// «Корона гречневого королевства» поверх карты или замка: игра Кайлани в окне
// (iframe) на весь экран. Порталом в body — окно постройки сдвинуто transform'ом,
// и fixed внутри него встал бы в рамку окна (как CasinoOverlay). Пока игра
// открыта, музыка карты и замка молчит — у игры своя. Та же рамка и тот же код игры —
// на ссылке /crown (site link): там сверху шапка с балансами и вводом/выводом DARAI.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { casinoMusicFocus } from "@/lib/audio/castleMusicController";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useBuckwheatHost } from "./useBuckwheatHost";
import { BuckwheatStats } from "./BuckwheatStats";
import { CrownBar } from "./CrownBar";

/** Сборка игры: scripts/build-minigames.mjs кладёт её в public/minigames/buckwheat. */
export const BUCKWHEAT_URL = "/minigames/buckwheat/index.html";

export function BuckwheatFrame({ onClose, site }: { onClose: () => void; site?: "link" }) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const frame = useRef<HTMLIFrameElement>(null);
  const [stats, setStats] = useState(false);
  useBuckwheatHost(frame, { onClose, onStats: () => setStats(true) }, site);
  useEffect(() => casinoMusicFocus.acquire(), []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("bw.title")}
      className="fixed inset-0 z-[140] flex flex-col bg-black pt-[var(--app-top,env(safe-area-inset-top,0px))]"
    >
      {site === "link" && <CrownBar frame={frame} />}
      <iframe
        ref={frame}
        src={`${BUCKWHEAT_URL}?lang=${lang === "en" ? "en" : "ru"}`}
        title={t("bw.title")}
        allow="autoplay"
        className="block min-h-0 w-full flex-1 border-0"
      />
      {stats && <BuckwheatStats onClose={() => setStats(false)} />}
    </div>
  );
}

export function BuckwheatOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(<BuckwheatFrame onClose={onClose} />, document.body);
}
