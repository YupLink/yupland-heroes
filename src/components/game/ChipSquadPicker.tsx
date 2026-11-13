// Отряд-пикер фишек: боевое поле (5 слотов) + резерв + грид инвентаря +
// автозаполнение. Родитель держит lineup. Занятые фишки в бой не идут — серые
// с таймером, а кнопка «Заменить выбывших» меняет их на свободные.
//
// Поле и грид вынесены в SquadField/SquadInventoryGrid: то же поле показывает
// окно боя с закреплённым отрядом героя, а файл держится в пределах 250 строк.
//
// allowBusy — режим замка: состав закрепляют на будущее, поэтому занятые фишки
// туда кладутся, а подрезка идёт по наличию (см. проп ниже).
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { hpOf, powerOf } from "@/lib/chipStats";
import { useSlotBusy } from "./squadBusy";
import { buildSquad } from "./squadRefill";
import { tirageBonus } from "@/lib/tirageBonus";
import { myChipInventory } from "@/server/api/chips-pack";
import { invalidateChipQueries } from "@/lib/query";
import { SquadField, FIELD_SLOTS } from "./SquadField";
import { SquadPickerHeader } from "./SquadPickerHeader";
import { useTrainingChips, isTrainingTemplate, trainingStrength } from "./useTrainingChips";
import {
  SquadInventoryGrid,
  readyChipsOf,
  readyCountOf,
  totalCountOf,
  type InvChip,
} from "./SquadInventoryGrid";

export const MAX_LINEUP = 10;
export { FIELD_SLOTS };

export type LineChip = {
  templateId: string;
  serialNo?: number | null;
  level: number;
  image: string;
  name: string;
  /** Тренировочная фишка прихожи: её сервер ищет не в инвентаре, а по id. */
  training?: boolean;
  trainingId?: string;
};

export function ChipSquadPicker({
  lineup,
  setLineup,
  allowBusy = false,
  allowTraining = false,
}: {
  lineup: LineChip[];
  setLineup: React.Dispatch<React.SetStateAction<LineChip[]>>;
  /**
   * Замок: состав закрепляют НА БУДУЩЕЕ, а не на текущий бой. Подрезка идёт по
   * НАЛИЧИЮ фишек, а не по готовности, и занятые ставятся в отряд наравне —
   * иначе сохранение во время оглушения выкидывало бы фишку из состава
   * навсегда, и одно оглушение стоило бы игроку слота до конца рейда.
   * По умолчанию выключено: бой и PvP собирают отряд как раньше.
   */
  allowBusy?: boolean;
  /**
   * Показывать тренировочные фишки прихожи. Включено только там, где сервер
   * умеет их принять (бои на гекс-карте и старый рейд): в замке такая фишка
   * молча выпала бы из отряда.
   */
  allowTraining?: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const inv = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
    staleTime: 120_000,
    refetchOnWindowFocus: false, // инвентарь тяжёлый — не тянем на каждый фокус
  });
  const [invOpen, setInvOpen] = useState(false);
  const [invShow, setInvShow] = useState(15);

  // Тренировочные встают в тот же список: грид, автоподбор и подрезка состава
  // работают по нему, и второй ветки для них заводить не нужно.
  //
  // ПЕРВЫМИ, а не в конце: грид показывает по пятнадцать стеков за раз, и у
  // игрока с сотней обычных фишек триалы уезжали за восемь нажатий «Показать
  // ещё» — то есть оставались невидимыми ровно там, где их и не хватало.
  const { chips: trainingChips, loading: trainingLoading } = useTrainingChips(
    allowTraining,
    t("chips.training_chip"),
  );
  const invChips = useMemo(
    () => [...trainingChips, ...((inv.data ?? []) as InvChip[]).filter((c) => c.count > 0)],
    [inv.data, trainingChips],
  );

  // Час отдыха: отдыхающие фишки не берутся в бой, серые + таймер. nowTick=0 на SSR.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  const usedOf = (templateId: string, level: number) =>
    lineup.filter((l) => l.templateId === templateId && l.level === level).length;

  // Занятость фишки в слоте — для поля отряда. В замке состав закрепляют
  // заранее, и выбитая боссом фишка обязана быть видна прямо в слоте: иначе
  // игрок узнаёт о потере только в бою, о чём и была жалоба. Записи без
  // серийника не молчат: за них отвечает агрегат по шаблону (см. squadBusy).
  const busyOf = useSlotBusy(invChips, nowTick, t);
  // В бою — только готовые; в замке любые, но ГОТОВЫЕ ПЕРВЫМИ: иначе «Авто»
  // после боя набирал тех же выбитых, и собрать боеспособный состав было
  // нечем, хотя свободных фишек у игрока сотни.
  const pickableOf = (c: InvChip) => {
    const ready = readyChipsOf(c, nowTick);
    if (!allowBusy) return ready;
    const ids = new Set(ready.map((x) => x.id));
    return [...ready, ...(c.chips ?? []).filter((x) => !ids.has(x.id))];
  };

  // Свежие фишки при входе (не тянуть сожжённые из persisted-кэша) — обе
  // кучи: тренировочные из пака острова иначе ждали бы конца staleTime.
  useEffect(() => {
    invalidateChipQueries(qc, "active");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // подрезать отряд под реально доступные фишки
  useEffect(() => {
    // Пока тренировочные не пришли, состав не трогаем: инвентарь отвечает
    // раньше, и запомненные триалы вырезались бы как отсутствующие.
    if (trainingLoading) return;
    setLineup((prev) => {
      if (prev.length === 0) return prev;
      const avail = new Map<string, number>();
      // В бою именно готовые: отдыхающих сервер в бой не пустит. В замке —
      // все имеющиеся: там состав закрепляют на будущее, и подрезка нужна
      // только против фишек, которых у игрока уже нет (сожгли, вывели в NFT).
      for (const c of invChips)
        avail.set(
          `${c.templateId}|${c.level}`,
          allowBusy ? totalCountOf(c) : readyCountOf(c, nowTick),
        );
      const used = new Map<string, number>();
      const pruned = prev.filter((l) => {
        const k = `${l.templateId}|${l.level}`;
        const u = used.get(k) ?? 0;
        if (u >= (avail.get(k) ?? 0)) return false;
        used.set(k, u + 1);
        return true;
      });
      return pruned.length === prev.length ? prev : pruned;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.data, trainingChips, trainingLoading, nowTick > 0]);

  const chipStrength = (c: InvChip): number => {
    // Оглушённая драться не может — для подбора её сила ноль, иначе выбитая
    // пятёрка всё время вытесняла бы свободную тройку.
    if (nowTick > 0 && readyChipsOf(c, nowTick).length === 0) return 0;
    // Тренировочная в бою вдвое слабее обычной той же звезды (сервер режет её
    // статы). Без поправки «Авто» ставил бы её впереди равной боевой фишки.
    if (isTrainingTemplate(c.templateId)) return trainingStrength(c);
    const b = tirageBonus(c.tirage ?? null, !!c.isPremium);
    const [lo, hi] = powerOf(c.level);
    const effHp = hpOf(c.level) * b.hpMult;
    const effAtk = ((lo + hi) / 2) * b.atkMult;
    return effHp * effAtk;
  };
  const autoFill = () =>
    setLineup(
      buildSquad({ keep: [], invChips, nowTick, strength: chipStrength, fillBusy: allowBusy }),
    );

  /** Сколько фишек в отряде не выйдет в бой; кнопка меняет их на свободные. */
  const busyInLineup = lineup.filter((l) => busyOf(l)).length;
  const replaceBusy = () =>
    setLineup(
      buildSquad({
        keep: lineup.filter((l) => !busyOf(l)),
        invChips,
        nowTick,
        strength: chipStrength,
        fillBusy: false,
      }),
    );

  const addChip = (c: InvChip) =>
    setLineup((p) => {
      const used = p.filter((x) => x.templateId === c.templateId && x.level === c.level).length;
      const pick = pickableOf(c);
      const inst = pick[used];
      const training = isTrainingTemplate(c.templateId);
      return [
        ...p,
        {
          templateId: c.templateId,
          serialNo: inst?.serialNo ?? null,
          level: c.level,
          image: c.imageUrl,
          name: c.templateName,
          ...(training ? { training: true, trainingId: inst?.id } : {}),
        },
      ];
    });

  return (
    <div data-squad-picker className="rounded-3xl border border-border bg-card p-3.5 shadow-card">
      <SquadPickerHeader
        count={lineup.length}
        max={MAX_LINEUP}
        fieldSlots={FIELD_SLOTS}
        canAuto={invChips.length > 0}
        busyInLineup={busyInLineup}
        invOpen={invOpen}
        onAuto={autoFill}
        onReplaceBusy={replaceBusy}
        onClear={() => setLineup([])}
        onToggleInv={() => setInvOpen((v) => !v)}
      />

      <SquadField
        lineup={lineup}
        onRemove={(i) => setLineup((p) => p.filter((_, j) => j !== i))}
        busyOf={busyOf}
      />

      {lineup.length === 0 && (
        <p className="mt-2.5 text-center text-xs text-muted-foreground">
          {t("squad.pick_hint", { n: MAX_LINEUP })}
        </p>
      )}

      {/* Пикер инвентаря */}
      {invOpen && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <SquadInventoryGrid
            chips={invChips}
            nowTick={nowTick}
            usedOf={usedOf}
            full={lineup.length >= MAX_LINEUP}
            show={invShow}
            onShowMore={() => setInvShow((n) => n + 10)}
            onAdd={addChip}
            allowBusy={allowBusy}
          />
        </div>
      )}
    </div>
  );
}
