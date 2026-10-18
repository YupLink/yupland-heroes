// Сборка отряда: свободные вперёд, оглушённые — в самый конец.
//
// Оглушённая фишка драться не может, поэтому для подбора её сила равна нулю:
// «Авто» обязан набрать боеспособных, даже если выбитая пятёрка сильнее любой
// свободной тройки. Занятых берём только тогда, когда свободных на состав не
// хватило — пустой слот хуже спящей фишки, она всё равно очнётся.
//
// Считаем по КОНКРЕТНЫМ экземплярам, а не по счётчику «сколько взяли из этого
// шаблона». Со счётчиком второй заход брал экземпляр по индексу и утаскивал в
// строй занятого, хотя свободный ещё оставался, — на этом и попался повторный
// «Авто»: первый раз собирал живых, второй подсовывал оглушённых.
import type { LineChip } from "./ChipSquadPicker";
import type { InvChip, InvChipInstance } from "./SquadInventoryGrid";
import { readyChipsOf } from "./SquadInventoryGrid";
import { isTrainingTemplate } from "./useTrainingChips";

export const MAX_LINEUP_SLOTS = 10;

const keyOf = (templateId: string, level: number) => `${templateId}|${level}`;

const lineOf = (c: InvChip, inst: InvChipInstance | undefined): LineChip => ({
  templateId: c.templateId,
  serialNo: inst?.serialNo ?? null,
  level: c.level,
  image: c.imageUrl,
  name: c.templateName,
  // Тренировочную сервер ищет по её собственному id, а не в инвентаре: без
  // него «Авто» ставил бы в строй фишку, которую бой молча выкинет.
  ...(isTrainingTemplate(c.templateId) ? { training: true, trainingId: inst?.id } : {}),
});

/** Экземпляры, которые уже стоят в составе: их второй раз в строй не берём. */
function takenIds(keep: LineChip[], invChips: InvChip[]): Set<string> {
  const out = new Set<string>();
  const byKey = new Map<string, InvChipInstance[]>();
  for (const c of invChips) byKey.set(keyOf(c.templateId, c.level), [...(c.chips ?? [])]);
  for (const l of keep) {
    const list = byKey.get(keyOf(l.templateId, l.level));
    if (!list || list.length === 0) continue;
    // Точное совпадение серийника; запись без серийника занимает любой
    // свободный экземпляр — иначе одна фишка попала бы в строй дважды.
    const at = l.serialNo != null ? list.findIndex((x) => x.serialNo === l.serialNo) : 0;
    const inst = list[at >= 0 ? at : 0];
    if (inst) {
      out.add(inst.id);
      list.splice(at >= 0 ? at : 0, 1);
    }
  }
  return out;
}

/**
 * Собрать состав: `keep` остаётся как есть, остальное добирается по силе.
 * Сначала свободные экземпляры, и только вторым заходом — занятые.
 */
export function buildSquad(opts: {
  keep: LineChip[];
  invChips: InvChip[];
  nowTick: number;
  strength: (c: InvChip) => number;
  /** Добирать ли занятыми, если свободных не хватило. */
  fillBusy: boolean;
}): LineChip[] {
  const { keep, invChips, nowTick, strength, fillBusy } = opts;
  const next = [...keep];
  const used = takenIds(keep, invChips);
  const sorted = [...invChips].sort((a, b) => strength(b) - strength(a));

  const take = (pool: (c: InvChip) => InvChipInstance[]) => {
    for (const c of sorted) {
      if (next.length >= MAX_LINEUP_SLOTS) return;
      for (const inst of pool(c)) {
        if (next.length >= MAX_LINEUP_SLOTS) return;
        if (used.has(inst.id)) continue;
        used.add(inst.id);
        next.push(lineOf(c, inst));
      }
    }
  };

  take((c) => readyChipsOf(c, nowTick));
  if (fillBusy) take((c) => c.chips ?? []);
  return next;
}
