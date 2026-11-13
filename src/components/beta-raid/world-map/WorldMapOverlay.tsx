// Карта мира на весь экран поверх рейда: местность, постройки (каждое
// поведение — своей меткой), замок, герой и мои клады — без мобов, боссов,
// артефактов, стоящих сундуков и мешочков (их нет в самом ответе сервера).
// Каждый вид меток включается и выключается тапом в легенде. Тап по точке —
// окно закрывается, камера рейда едет туда, как от тапа по миникарте.
//
// Слой — порталом в body: в полноэкранном рейде холст живёт в своём слое
// (fixed z-50), и окно внутри него не перекрыло бы остальное приложение.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { List, Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { getWorldMap } from "@/server/api/beta-raid/world-map";
import type { WorldMapAccess } from "@/lib/raid/worldMapAccess";
import type { WorldMapMode } from "@/lib/raid/worldMapCodec";
import { worldMapModel } from "./worldMapModel";
import { useTerrainPalette } from "./useTerrainPalette";
import { useWorldMapLayers } from "./useWorldMapLayers";
import { WorldMapCanvas } from "./WorldMapCanvas";
import { WorldMapLegend } from "./WorldMapLegend";

/** Режим, в котором карту закрыли: следующее открытие — в нём же (до перезагрузки). */
let lastMode: WorldMapMode = "seen";

const MODES: readonly WorldMapMode[] = ["seen", "all"];

export function WorldMapOverlay({
  access,
  heroQ,
  heroR,
  castle,
  onPick,
  onClose,
}: {
  access: WorldMapAccess;
  heroQ: number | null;
  heroR: number | null;
  castle: { q: number; r: number };
  onPick: (q: number, r: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<WorldMapMode>(access.all ? lastMode : "seen");
  // Легенда на ПК открыта сразу, на телефоне — по кнопке: там она закрыла бы карту.
  const [legend, setLegend] = useState(() => window.innerWidth >= 640);
  const layers = useWorldMapLayers();
  const q = useQuery({
    // «view» вторым ключом: такие ответы не сохраняются в localStorage
    // (query.ts) — карта нужна, только пока окно открыто.
    queryKey: ["world-map", "view", mode],
    queryFn: () => getWorldMap({ data: { mode } }),
    // Открыл окно — свежая разведка; пока едет, виден прошлый ответ.
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    retry: 1,
  });
  const model = useMemo(() => (q.data ? worldMapModel(q.data) : null), [q.data]);
  const palette = useTerrainPalette(model?.terrains);
  const broken = !!q.data && !model;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickMode = (m: WorldMapMode) => {
    lastMode = m;
    setMode(m);
  };

  const iconBtn =
    "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-black/50 text-muted-foreground transition active:scale-95";

  return createPortal(
    <div
      role="dialog"
      aria-label={t("wmap.title")}
      className="fixed inset-0 z-[120] flex touch-none select-none flex-col bg-[#10141c] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[max(8px,var(--app-top,env(safe-area-inset-top,0px)))]"
    >
      <header className="flex shrink-0 items-center gap-2 px-3 pb-2">
        <h2 className="hidden font-display text-lg font-bold text-foreground sm:block">
          {t("wmap.title")}
        </h2>
        {access.all && (
          <div className="flex rounded-full border border-border bg-black/50 p-0.5">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => pickMode(m)}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-semibold transition",
                  mode === m ? "bg-gold text-gold-foreground" : "text-muted-foreground",
                )}
              >
                {t(m === "seen" ? "wmap.mode_seen" : "wmap.mode_all")}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLegend((v) => !v)}
            aria-label={t("wmap.legend")}
            title={t("wmap.legend")}
            className={cn(iconBtn, legend && "border-gold/70 text-gold")}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
            className={iconBtn}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <WorldMapCanvas
          model={model}
          palette={palette}
          heroQ={heroQ}
          heroR={heroR}
          castle={castle}
          hidden={layers.hidden}
          onPick={onPick}
        />
        {(q.isPending || (q.isFetching && q.isPlaceholderData)) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-gold" />
          </div>
        )}
        {((q.isError && !q.data) || broken) && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                {broken ? t("common.error") : humanError(q.error)}
              </p>
              <button
                type="button"
                onClick={() => void q.refetch()}
                className="h-10 rounded-full border border-gold/60 px-5 text-sm font-semibold text-gold"
              >
                {t("common.update")}
              </button>
            </div>
          </div>
        )}
        {legend && model && (
          <WorldMapLegend
            model={model}
            palette={palette}
            hidden={layers.hidden}
            onToggle={layers.toggle}
            onToggleAll={layers.toggleAll}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
