import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cabinetMarkup } from "./cabinetMarkup";
import { setupControls, type CabinetApi } from "./controls";
import { setupRules } from "./rules";
import { SlotReels } from "../SlotReels";
import { SlotWinFx } from "../SlotFx";
import { winTier } from "@/lib/slot/winTier";
import { text } from "./shared";
import "./cabinet.css";
import "./runtime.css";
import "../slot-frame.css";

// Keep the accepted HTML host stable: controls and React portals own its descendants.
// Reapplying innerHTML on a balance/query render would detach both of them.
const CabinetArtwork = memo(function CabinetArtwork() {
  return <div dangerouslySetInnerHTML={{ __html: cabinetMarkup }} />;
});

export function SlotCabinet({
  api,
  showLines,
  children,
  onStats,
  retry,
}: {
  api: CabinetApi;
  showLines: boolean;
  children: ReactNode;
  onStats?: () => void;
  retry: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    apiRef = useRef(api);
  apiRef.current = api;
  const controls = useRef<ReturnType<typeof setupControls> | null>(null);
  const linkedRules = useRef(false);
  const [mounts, setMounts] = useState<{
    reels: HTMLElement;
    stage: HTMLElement;
  } | null>(null);
  useLayoutEffect(() => {
    const node = root.current!;
    controls.current = setupControls(node, () => apiRef.current);
    const cleanRules = setupRules(
      node,
      () => ({
        lines: apiRef.current.state.lines,
        bet: apiRef.current.state.bet,
      }),
      api.ru ? "ru" : "en",
      () => {
        if (apiRef.current.state.auto)
          apiRef.current.dispatch({ type: "toggle-auto" });
      },
    );
    setMounts({
      reels: node.querySelector("#reel-mount")!,
      stage: node.querySelector(".cabinet-stage")!,
    });
    controls.current.render();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      controls.current?.dispose();
      cleanRules();
      document.body.style.overflow = previous;
    };
  }, [api.ru]);
  useLayoutEffect(() => {
    controls.current?.render();
  }, [api]);
  useEffect(() => {
    if (
      linkedRules.current ||
      api.loading ||
      api.error ||
      !["idle", "won"].includes(api.state.phase)
    )
      return;
    linkedRules.current = true;
    const page = Number(new URLSearchParams(location.search).get("rules"));
    if (page >= 1 && page <= 4) {
      root.current?.querySelector<HTMLButtonElement>("#rules-button")?.click();
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-rule="${page - 1}"]`)
        ?.click();
    }
  }, [api.loading, api.error, api.state.phase]);
  useEffect(() => {
    if (!["idle", "won", "spinning"].includes(api.state.phase))
      root.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [api.state.phase]);
  const s = api.state,
    tier = s.phase === "won" ? winTier(s.lastWin, s.lines * s.bet) : 0;
  return (
    <div
      className="casino-ui"
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={text(api.ru, "Раскопки", "Excavation")}
    >
      <CabinetArtwork />
      {mounts &&
        ["idle", "won", "spinning", "bonus-won"].includes(s.phase) &&
        createPortal(
          <>
            <SlotReels
              grid={s.result?.grid ?? null}
              spinning={s.phase === "spinning"}
              spinId={s.spinId}
              wins={s.result?.lineWins ?? []}
              activeLines={s.lines}
              showLines={showLines}
              highlightBonus={s.phase === "bonus-won"}
            />
            <SlotWinFx
              tier={tier}
              trigger={tier > 0 ? s.spinId : 0}
              win={s.lastWin}
            />
          </>,
          mounts.reels,
        )}
      {mounts && createPortal(children, mounts.stage)}
      {(api.loading || api.error) && (
        <div className="cabinet-status" role="status">
          {api.error ? (
            <>
              {text(
                api.ru,
                "Не удалось загрузить игру",
                "Could not load the game",
              )}
              <button onClick={retry}>
                {text(api.ru, "Повторить", "Retry")}
              </button>
            </>
          ) : (
            text(api.ru, "Загружаем игру…", "Loading game…")
          )}
        </div>
      )}
      {onStats && (
        <button className="cabinet-stats" onClick={onStats}>
          {text(api.ru, "Статистика", "Statistics")}
        </button>
      )}
    </div>
  );
}
