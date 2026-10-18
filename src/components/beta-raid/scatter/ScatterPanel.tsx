// Панель автораздачи: снять отработавшие объекты и поставить вместо них новых,
// раздав наградные фонды.
//
// Порядок жёсткий: настроил → ПОСЧИТАЛ → подтвердил → раздал. Кнопка запуска
// не работает, пока предпросмотр не сделан ИМЕННО под текущие настройки:
// действие массовое и необратимое, а «сколько встанет» зависит от того,
// сколько на карте свободных клеток нужной местности — на глаз это не считают.
//
// Правка настроек прячет старый отчёт: он описывал другой план, и оставлять
// его на экране значит показывать обещание, которого больше никто не давал.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Calculator, Dices, Loader2, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { invalidateRaidMap } from "@/lib/query";
import { adminListRewardTokens } from "@/server/api/boss";
import { adminScatterPreview, adminScatterRun } from "@/server/api/beta-raid/scatter";
import type { ScatterReport as Report } from "@/lib/raid/scatterPlan";
import { DARAI_POOL_KEY } from "../AdminMapPoolBar";
import { FREE_TOKEN_KEY } from "../AdminFreeTokenBar";
import { ScatterBossSection } from "./ScatterBossSection";
import { ScatterPileSection } from "./ScatterPileSection";
import { ScatterArtifactSection } from "./ScatterArtifactSection";
import { ScatterReport } from "./ScatterReport";
import { fmtNum } from "./scatterFormat";
import {
  emptyScatterDraft,
  nothingEnabled,
  toScatterPlan,
  type ScatterDraft,
} from "./scatterDraft";
import { newSeed } from "@/lib/raid/zonegen/recipe";

/** Сколько ждём второго нажатия по «Раздать», прежде чем передумать за админа. */
const CONFIRM_MS = 5_000;

export function ScatterPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ScatterDraft>(emptyScatterDraft);
  // Отчёт помнит, ПОД КАКОЙ план он сделан: иначе после правки чисел на экране
  // висело бы обещание от прошлых настроек.
  const [result, setResult] = useState<{ key: string; done: boolean; data: Report } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const plan = toScatterPlan(draft);
  const planKey = JSON.stringify(plan);
  const fresh = result?.key === planKey;
  const empty = nothingEnabled(draft);

  const tokens = useQuery({
    queryKey: ["reward-tokens", "symbols"],
    queryFn: () => adminListRewardTokens(),
    staleTime: 5 * 60_000,
  });

  const preview = useMutation({
    mutationFn: () => adminScatterPreview({ data: plan }),
    onSuccess: (data) => setResult({ key: planKey, done: false, data }),
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const run = useMutation({
    mutationFn: () => adminScatterRun({ data: plan }),
    onSuccess: (data) => {
      setResult({ key: planKey, done: true, data });
      setConfirm(false);
      const created = data.groups.reduce((s, g) => s + g.created, 0);
      toast.success(`Раздано объектов: ${created}`);
      // Карта, окна объектов и обе кучи обеспечения — ровно те же ключи, что
      // сбрасывает восстановление (AdminRaidRestore): страницу не перезагружают.
      invalidateRaidMap(qc, ["beta-encounter", "beta-raid-restore-preview"]);
      qc.invalidateQueries({ queryKey: DARAI_POOL_KEY });
      qc.invalidateQueries({ queryKey: FREE_TOKEN_KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Забытая на экране красная кнопка опаснее её отсутствия: второй тап по ней
  // через полчаса будет уже случайным (та же логика у корзины в AdminBrushBar).
  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirm]);
  // Настройки поехали — подтверждение больше не про них.
  useEffect(() => setConfirm(false), [planKey]);

  const busy = preview.isPending || run.isPending;
  // Повторный запуск того же плана закрыт: он бы раздал всё второй раз. Чтобы
  // раздать ещё — считаем заново, уже по обновившейся карте.
  const canRun = fresh && !result?.done && !empty && !busy;
  // Минус по деньгам берём только из СВЕЖЕГО отчёта: он про этот план, а не
  // про прошлый, — той же меркой открывается и сама кнопка запуска.
  const minus = fresh ? (result?.data.shortfalls ?? []) : [];

  const patch = (next: Partial<ScatterDraft>) => setDraft((d) => ({ ...d, ...next }));
  const list = tokens.data ?? [];

  // На сервере body нет: страницу рейда рендерит и SSR, а портал там упал бы.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:max-h-[90vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold">Раздать заново</h3>
            <p className="truncate text-[10px] text-muted-foreground">
              Отработавшие — с карты, новые — в свободные клетки
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Своя прокрутка тела: на 360 px четыре раздела с отчётом не влезают,
            а шапка и кнопка действия должны оставаться на виду. */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2.5">
          {/* Сид: с ним та же раскладка повторится клетка в клетку (тот же план,
              та же карта), пусто — прежний жребий. Фраза удобнее числа: её
              можно продиктовать. */}
          <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
              Сид
            </span>
            <input
              value={draft.seed}
              onChange={(e) => patch({ seed: e.target.value.slice(0, 80) })}
              placeholder="пусто — как раньше, вразнобой"
              className="min-w-0 flex-1 rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground"
            />
            <button
              type="button"
              onClick={() => patch({ seed: String(newSeed()) })}
              title="Новый сид"
              className="shrink-0 rounded-lg bg-secondary/40 px-2 py-1 text-[11px] font-semibold text-muted-foreground"
            >
              <Dices className="h-3.5 w-3.5" />
            </button>
          </label>
          <ScatterBossSection
            value={draft.boss}
            onChange={(boss) => patch({ boss })}
            tokens={list}
          />
          {/* Один раздел на сундуки и монетки: владелец просил не делить их —
              «разница только в том, что монеткам я не задаю паки и артефакты».
              Вид каждого объекта решает его шаблон, и на карте они всё равно
              расходятся по своим группам. */}
          <ScatterPileSection
            title="Добыча · сундуки и монетки"
            pile="any"
            value={draft.loot}
            onChange={(loot) => patch({ loot })}
            tokens={list}
            removeHint="Отработавшие уйдут с карты. Недобитые и нетронутые останутся"
            pickerTitle="Чем ставить"
          />
          <ScatterArtifactSection
            value={draft.artifacts}
            onChange={(artifacts) => patch({ artifacts })}
          />

          <ScatterReport
            report={fresh ? result?.data : undefined}
            loading={preview.isPending}
            done={!!result?.done}
          />
        </div>

        <div className="shrink-0 space-y-1.5 border-t border-border p-2.5 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:pb-3">
          {/* Минус по деньгам обязан доехать до самой кнопки: отчёт живёт в
              прокрутке тела, и на 360 px до него можно не долистать. Запуск при
              этом открыт — раздавать в «-» админ вправе, наше дело сказать. */}
          {minus.length > 0 && (
            <p className="flex items-start justify-center gap-1 text-center text-[11px] font-bold leading-tight text-destructive">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">
                {(result?.done ? "Роздано в минус: " : "Уйдём в минус: ") +
                  minus.map((s) => `${s.symbol} −${fmtNum(s.gap, 6)}`).join(", ")}
              </span>
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => preview.mutate()}
              disabled={empty || busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border px-3 py-3 text-[13px] font-bold disabled:opacity-40"
            >
              {preview.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              Посчитать
            </button>
            <button
              type="button"
              onClick={() => (confirm ? run.mutate() : setConfirm(true))}
              disabled={!canRun}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-[13px] font-bold disabled:opacity-40",
                confirm
                  ? "bg-destructive text-destructive-foreground"
                  : "gradient-gold text-gold-foreground",
              )}
            >
              {run.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shuffle className="h-4 w-4" />
              )}
              {confirm ? "Точно раздать?" : "Раздать"}
            </button>
          </div>
          <p className="text-center text-[10px] leading-tight text-muted-foreground">
            {empty
              ? "Включи хотя бы одну группу"
              : result?.done && fresh
                ? "Роздано. Чтобы повторить — посчитай заново"
                : fresh
                  ? "Запуск снимет и поставит объекты — отменить нельзя"
                  : "Сначала «Посчитать» — запуск открывается после предпросмотра"}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
