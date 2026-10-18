// Админский блок на экране рейда: оживить объекты активной карты.
// Обычные игроки его не видят; вид намеренно скромный — это служебная кнопка.
import { useState } from "react";
import { AdminBossLevelRange, parseLevelRange } from "./AdminBossLevelRange";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Loader2, RefreshCw, RotateCcw, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  adminRestoreRaidObjects,
  adminRaidRestorePreview,
} from "@/server/api/beta-raid/admin-restore";
import { adminRebuildMap } from "@/server/api/beta-raid/map-rebuild";
import { AdminMapExpand } from "./AdminMapExpand";
import { AdminRestoreConfirm, type RestoreResources } from "./AdminRestoreConfirm";
import { invalidateRaidMap } from "@/lib/query";
import { AdminMapPoolBar, DARAI_POOL_KEY } from "./AdminMapPoolBar";
import { AdminFreeTokenBar, FREE_TOKEN_KEY } from "./AdminFreeTokenBar";
import { AdminCasinoPoolBar } from "./AdminCasinoPoolBar";
import { ScatterPanel } from "./scatter/ScatterPanel";
import { toggleEconomyOpen } from "./economyOpenBus";
import { humanError } from "@/lib/humanError";

type Target = "boss" | "chests" | "coins" | "artifacts";

const LABELS: Array<{ key: Target; label: string }> = [
  { key: "boss", label: "Боссы" },
  { key: "chests", label: "Сундуки" },
  { key: "coins", label: "Монетки" },
  { key: "artifacts", label: "Артефакты" },
];

export function AdminRaidRestore() {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<Target, boolean>>({
    boss: true,
    chests: true,
    coins: true,
    artifacts: false,
  });

  const [confirming, setConfirming] = useState(false);
  // Автораздача живёт своим окном: настроек у неё на четыре раздела, в строку
  // над картой они не встают.
  const [scattering, setScattering] = useState(false);
  // Валюты решают отдельно от видов: «боссов с Darai поднимай, с USDT не
  // трогай». Обе включены — кнопка работает как до появления фильтра.
  const [resources, setResources] = useState<RestoreResources>({ darai: true, usdt: true });
  // Диапазон уровней боссов: пусто — все, как было раньше.
  const [levelRange, setLevelRange] = useState("");
  const levels = parseLevelRange(levelRange);
  const restoreInput = {
    ...picked,
    bossLevelFrom: levels.from,
    bossLevelTo: levels.to,
    withDarai: resources.darai,
    withUsdt: resources.usdt,
  };
  // Сколько чего вернётся — считает сервер, показываем перед нажатием.
  const preview = useQuery({
    // Диапазон в ключе: иначе подтверждение показывало бы счёт от прошлого
    // диапазона и обещало не то, что вернёт кнопка.
    // Валюты в ключе: переключил галочку — счёт пересчитывается сразу, без
    // закрытия окна.
    queryKey: [
      "beta-raid-restore-preview",
      // Версия формы ответа прямо в ключе: старый ответ (плоские boss/chests
      // без разбивки по валютам) лежит в суточном кэше и ронял окно. Ключ
      // отсекает его точечно, не дожидаясь общего сброса кэша.
      "v2",
      levels.from ?? null,
      levels.to ?? null,
      resources.darai,
      resources.usdt,
    ],
    queryFn: () =>
      adminRaidRestorePreview({
        data: {
          bossLevelFrom: levels.from,
          bossLevelTo: levels.to,
          withDarai: resources.darai,
          withUsdt: resources.usdt,
        },
      }),
    enabled: confirming,
    staleTime: 10_000,
  });

  // Кнопка на случай, когда карту меняли мимо игры: сбрасывает снимок и
  // убирает осиротевшие записи здоровья снятых объектов.
  const rebuild = useMutation({
    mutationFn: () => adminRebuildMap(),
    onSuccess: (r) => {
      toast.success(
        r.orphansRemoved > 0
          ? `Карта перестроена · клеток ${r.cells} · убрано лишних записей: ${r.orphansRemoved}`
          : `Карта перестроена · клеток ${r.cells}`,
      );
      invalidateRaidMap(qc);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const restore = useMutation({
    mutationFn: () => adminRestoreRaidObjects({ data: restoreInput }),
    onSuccess: (r) => {
      toast.success(
        r.skippedUnderPlayers > 0
          ? `Восстановлено ${r.restored} · пропущено под игроками: ${r.skippedUnderPlayers}`
          : `Восстановлено объектов: ${r.restored}`,
      );
      setConfirming(false);
      invalidateRaidMap(qc, ["beta-encounter", "beta-raid-restore-preview"]);
      // Поднятые объекты заново заложили свои награды — остаток пула сдвинулся.
      qc.invalidateQueries({ queryKey: DARAI_POOL_KEY });
      qc.invalidateQueries({ queryKey: FREE_TOKEN_KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const nothingPicked = !LABELS.some(({ key }) => picked[key]);

  return (
    <div className="mx-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-border px-2.5 py-2">
      {/* Обеспечение наград — над самой картой и первой строкой: восстановление
          тратит именно его, и видеть остаток надо ДО нажатия. */}
      <AdminMapPoolBar />
      {/* Рядом с пулом Darai: восстановление и наполнение карты тратят обе
          кучи, и решать «класть ли USDT» надо по этой строке. */}
      <AdminFreeTokenBar />
      {/* Пул золота казино: сколько казино заработало (всего и за сутки). */}
      <AdminCasinoPoolBar />
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Админ
      </span>
      {LABELS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => setPicked((p) => ({ ...p, [key]: !p[key] }))}
          className={cn(
            "rounded-lg border px-2 py-1 text-[11px] font-semibold transition",
            picked[key]
              ? "border-gold/50 bg-gold/10 text-gold"
              : "border-border text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
      {picked.boss && (
        <AdminBossLevelRange
          value={levelRange}
          onChange={setLevelRange}
          disabled={restore.isPending}
        />
      )}
      <button
        type="button"
        onClick={() => rebuild.mutate()}
        disabled={rebuild.isPending}
        title="Сбросить снимок карты и убрать осиротевшие записи"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition enabled:hover:text-foreground disabled:opacity-40"
      >
        {rebuild.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Перестроить карту
      </button>

      <AdminMapExpand />

      {/* Сосед «Восстановить»: та поднимает убитых на их же местах, эта снимает
          их и ставит новых в другие клетки. Соседство намеренное — выбирают
          между ними, глядя на одни и те же остатки пулов выше. */}
      <button
        type="button"
        onClick={() => setScattering(true)}
        title="Снять отработавшие объекты и поставить новых в свободные клетки"
        className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1 text-[11px] font-semibold text-gold transition enabled:hover:bg-gold/10"
      >
        <Shuffle className="h-3.5 w-3.5" />
        Раздать заново
      </button>

      {/* Сводка экономики: товары, игроки, города, цены. Читает и не портит —
          соседствовать с «Раздать заново» безопасно, места отдельного не требует. */}
      <button
        type="button"
        onClick={() => toggleEconomyOpen()}
        title="Товары, игроки, города, дёшево/дорого — панель раскроется под картой"
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition enabled:hover:bg-emerald-500/10"
      >
        <DollarSign className="h-3.5 w-3.5" />
        Экономика
      </button>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={restore.isPending || nothingPicked}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-bold transition enabled:hover:bg-secondary/70 disabled:opacity-40"
      >
        {restore.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" />
        )}
        Восстановить
      </button>

      {confirming && (
        <AdminRestoreConfirm
          picked={picked}
          resources={resources}
          onToggleResource={(r) => setResources((p) => ({ ...p, [r]: !p[r] }))}
          preview={preview.data}
          loading={preview.isLoading}
          busy={restore.isPending}
          onConfirm={() => restore.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}

      {scattering && <ScatterPanel onClose={() => setScattering(false)} />}
      {/* Сама панель «$ Экономика» рендерится не тут, а под картой в
          BetaRaidScreen через economyOpenBus — так карта остаётся видной
          и работает в штатном режиме, а панель под ней. */}
    </div>
  );
}
