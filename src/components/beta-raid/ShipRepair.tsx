// Запас хода судна и починка досками — отдельный блок окна корабля.
//
// Полоска повторяет ту, что нарисована под кораблём на карте: цвет считается по
// той же доле, чтобы игрок видел в окне ровно то, что видел на клетке. Ниже —
// кнопка починки: сколько досок нужно и сколько лежит в рюкзаке героя.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Axe, Hammer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { serverErrorText } from "@/lib/serverErrorText";
import { useT } from "@/lib/i18n";
import { getShipRepair, repairShip } from "@/server/api/beta-raid/ship-repair";
import { getShipScrap, scrapShip } from "@/server/api/beta-raid/ship-scrap";
import { SHIP_HP_PER_PLANK } from "@/lib/shipHealth";
import { invalidateBackpack } from "@/lib/query";

const barColor = (ratio: number): string =>
  ratio > 0.5 ? "bg-emerald-400" : ratio > 0.2 ? "bg-yellow-400" : "bg-destructive";

/**
 * Полоска запаса хода с числами — тот же цвет, что и на карте.
 *
 * Число крупное и первым делом: по полоске «сколько осталось» не прочитать, а
 * решение плыть дальше или чинить принимается именно по нему. `compact` —
 * версия для карточки «рядом корабль», где места на строку меньше.
 */
export function ShipHpBar({
  hp,
  hpMax,
  compact,
}: {
  hp: number;
  hpMax: number;
  compact?: boolean;
}) {
  const t = useT();
  if (hpMax <= 0) return null;
  const ratio = Math.max(0, Math.min(1, hp / hpMax));
  const left = Math.max(0, Math.round(hp));
  return (
    <div className={compact ? "space-y-0.5" : "space-y-1"}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("braid.ship_hp")}
        </span>
        <span
          className={
            compact ? "text-xs font-bold tabular-nums" : "text-base font-bold tabular-nums"
          }
        >
          {left}
          <span className="text-[11px] font-medium text-muted-foreground"> / {hpMax}</span>
        </span>
      </div>
      <div
        className={`${compact ? "h-1.5" : "h-2.5"} w-full overflow-hidden rounded-full bg-secondary/60`}
      >
        <div
          className={`h-full rounded-full ${barColor(ratio)}`}
          style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Починка разбитого судна. Показывается только там, где есть что чинить:
 * запрос сам вернёт null, если на клетке все борта целы.
 */
export function ShipRepair({
  q,
  r,
  shipId = null,
  onDone,
}: {
  q: number;
  r: number;
  /** Какой борт чиним, когда на клетке их несколько. */
  shipId?: string | null;
  onDone?: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["ship-repair", q, r, shipId],
    queryFn: () => getShipRepair({ data: { q, r, shipId } }),
    staleTime: 5_000,
  });

  const cap = Math.max(0, Math.min(info.data?.have ?? 0, info.data?.need ?? 0));
  const [spend, setSpend] = useState<number>(0);
  // Каждый раз, когда меняется потолок (пришёл ответ, чинили — cap уменьшился),
  // выставляем ползунок «до упора»: чаще всего игрок хочет полностью, а
  // руками выберет меньше, только если знает зачем.
  useEffect(() => {
    setSpend(cap);
  }, [cap]);

  const fix = useMutation({
    mutationFn: () => repairShip({ data: { q, r, shipId, spend } }),
    onSuccess: (res) => {
      toast.success(t("braid.ship_repaired", { n: res.spent, hp: res.hp }));
      // Причалы, рюкзак и сама карточка чинимого судна — всё это только что
      // изменилось: без обновления игрок увидел бы прежний мёртвый арт.
      qc.invalidateQueries({ queryKey: ["beta-raid-ships"] });
      // Ключ рюкзака — ["my-hero-backpack"]: с "hero-backpack" доски после
      // разборки/починки появлялись только через 30 с или после F5.
      invalidateBackpack(qc);
      qc.invalidateQueries({ queryKey: ["ship-repair", q, r] });
      qc.invalidateQueries({ queryKey: ["ship-scrap", q, r] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });

  // Разбор — только для полностью разбитого судна (hp=0). Отдельный запрос,
  // потому что репэр показывает и подранки: рядом уживаться удобнее.
  const scrap = useQuery({
    queryKey: ["ship-scrap", q, r, shipId],
    queryFn: () => getShipScrap({ data: { q, r, shipId } }),
    staleTime: 5_000,
  });
  const doScrap = useMutation({
    mutationFn: () => scrapShip({ data: { q, r, shipId } }),
    onSuccess: (res) => {
      toast.success(t("braid.ship_scrapped", { n: res.planks }));
      qc.invalidateQueries({ queryKey: ["beta-raid-ships"] });
      // Ключ рюкзака — ["my-hero-backpack"]: с "hero-backpack" доски после
      // разборки/починки появлялись только через 30 с или после F5.
      invalidateBackpack(qc);
      qc.invalidateQueries({ queryKey: ["my-energy"] });
      qc.invalidateQueries({ queryKey: ["ship-repair", q, r] });
      qc.invalidateQueries({ queryKey: ["ship-scrap", q, r] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });

  const data = info.data ?? null;
  if (info.isPending && scrap.isPending) {
    return (
      <div className="flex justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Ни починить (свой/свободный подранок), ни разобрать (чужой утопленник):
  // на клетке для меня ничего интересного нет.
  if (!data && !scrap.data) return null;

  const enough = (data?.have ?? 0) > 0;
  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      {data && <ShipHpBar hp={data.hp} hpMax={data.hpMax} />}
      {data && (
        <p className="text-[11px] text-muted-foreground">
          {t("braid.ship_repair_hint", { n: SHIP_HP_PER_PLANK })}
        </p>
      )}
      {data && (
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-muted-foreground">
            {t("braid.ship_repair_need", { n: data.need })}
          </span>
          <span className={enough ? "font-semibold" : "font-semibold text-destructive"}>
            {t("braid.ship_repair_have", { n: data.have })}
          </span>
        </div>
      )}
      {/* Ползунок сколько досок реально потратить: игроки жаловались, что
          «тратятся все доски с кармана». Сервер уже ограничивает верх min(have,
          need), тут даём выбрать меньше — например починить на пару делений. */}
      {cap > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-muted-foreground">{t("braid.ship_repair_use")}</span>
            <span className="font-semibold tabular-nums">
              {spend} <span className="text-muted-foreground">/ {cap}</span>
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={cap}
            step={1}
            value={spend}
            onChange={(e) => setSpend(Number(e.target.value))}
            className="w-full accent-gold"
          />
        </div>
      )}
      {data && (
        <button
          type="button"
          onClick={() => fix.mutate()}
          disabled={fix.isPending || !enough || spend <= 0}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {fix.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Hammer className="h-4 w-4" />
          )}
          {t("braid.ship_repair")}
          {cap > 1 && spend > 0 && spend !== cap && (
            <span className="text-[11px] font-normal text-muted-foreground">· {spend}</span>
          )}
        </button>
      )}
      {/* Разбор на доски — только для полностью разбитого судна (hp=0).
          Может кто угодно, не только владелец, стоит 1 энергию, даёт
          small=1, big=2 досок. Сам получаешь доски в рюкзак. */}
      {scrap.data && (
        <button
          type="button"
          onClick={() => doScrap.mutate()}
          disabled={doScrap.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300 disabled:opacity-50"
        >
          {doScrap.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Axe className="h-4 w-4" />
          )}
          {t("braid.ship_scrap", {
            n: scrap.data.planks,
            e: scrap.data.cost,
          })}
        </button>
      )}
    </div>
  );
}
