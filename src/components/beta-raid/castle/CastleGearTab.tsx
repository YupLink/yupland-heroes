import { useGearContainerPreview } from "./useGearContainerPreview";
// Вкладка «Снаряжение»: места героя под артефакты. Мест не восемь — сколько их,
// решает редкость героя (владелец, 27.08: эпику +2 кармана и +1 руки, легендарю
// +4 кармана, +1 тело и +1 руки). Раскладку целиком отдаёт сервер: он же пишет
// в hero_instance.equipped и он же считает бой, так что второй копии правила
// «сколько карманов у эпика» на клиенте нет.
//
// Вкладка ничего не считает и ничего не фильтрует: и список кандидатов, и
// разбор прибавок приходят готовыми из getMyHeroGear. Раньше рядом жил второй
// запрос — весь инвентарь (listMyItems) — и своя копия правил поверх него;
// две реализации одного правила ждали, когда разойтись. Теперь источник один.
//
// Три вещи, из-за которых вкладку переделали (жалобы владельца 26.08):
//   • одинаковые предметы шли отдельными строками, и список слота выглядел
//     длиннее инвентаря — сервер схлопывает их в «×N»;
//   • предметы с незаданным ИЛИ незнакомым слотом просто исчезали из всех
//     списков: владелец искал свою броню и не находил — теперь она внизу
//     отдельным блоком с причиной;
//   • по строке прибавок было не понять, работает ли она на этом герое —
//     разбор ушёл в GearItemLines.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { BestGearButton } from "../BestGearButton";
import { GearPresets } from "../gear/GearPresets";
import { GearSlotDetails } from "./GearSlotDetails";
import { GearSlotGrid } from "./GearSlotGrid";
import { GearPaperDoll } from "./GearPaperDoll";
import type { Castle } from "./useCastle";

export function CastleGearTab({ castle, atCastle, paperDoll = false, race, onNavigate, referenceLayout = false }: { castle: Castle; atCastle: boolean; paperDoll?: boolean; race?: string | null; onNavigate?: (tab: "backpack" | "potions" | "spells") => void; referenceLayout?: boolean }) {
  const t = useT();
  const lang = useLang();
  // Открытое место хранится КЛЮЧОМ («Карманы#2»), а не типом слота: у эпика и
  // легендаря мест одного типа несколько, и по типу было бы не понять, какое
  // из них игрок открыл.
  const [open, setOpen] = useState<string | null>(null);

  const langRu = lang === "ru";
  const containers = useGearContainerPreview(castle, paperDoll);
  const gear = castle.gear.data;
  // Array.isArray, а не «?? []»: раньше slots был ОБЪЕКТОМ «слот → предмет», и
  // такой ответ сутки лежит в localStorage (yuplink-rq-cache). До первого
  // рефетча .find() по объекту уронил бы вкладку — показываем пустую сетку.
  const slots = Array.isArray(gear?.slots) ? gear.slots : [];
  const available = gear?.available ?? {};
  const noSlot = gear?.noSlot ?? [];

  const openSlot = open ? (slots.find((d) => d.key === open) ?? null) : null;
  const candidates = openSlot ? (available[openSlot.slot] ?? []) : [];
  const { equip, unequip } = castle.mut;

  // До первого ответа сервера про героя ничего не известно — крутилка, а не
  // «героя нет»: пустой экран на секунду читался как «всё пропало».
  if (castle.gear.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-gold" />
      </div>
    );
  }
  if (!gear?.heroId) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        {t("braid.castle_no_hero")}
      </p>
    );
  }

  const slotDetails = openSlot && (
        <GearSlotDetails
          slot={openSlot}
          candidates={candidates}
          readOnly={castle.gearReadOnly}
          atCastle={atCastle}
          equipPending={equip.isPending}
          unequipPending={unequip.isPending}
          onUnequip={(slotKey) => unequip.mutate(slotKey)}
          onEquip={(itemId, slotKey) => equip.mutate(
            { itemId, slotKey },
            { onSuccess: () => setOpen(null) },
          )}
        />
      );

  const gearTotals = [
    [langRu ? "Атака" : "Attack", gear.stats.atk],
    [langRu ? "Броня" : "Armor", gear.stats.arm],
    [langRu ? "Интеллект" : "Intellect", gear.stats.int],
    [langRu ? "Скорость" : "Speed", gear.stats.spd],
    [langRu ? "Здоровье" : "Health", gear.stats.hp],
    [langRu ? "Удача" : "Luck", gear.stats.luck],
    [langRu ? "Торговля" : "Trade", gear.trade],
    [langRu ? "Алхимия" : "Alchemy", (gear as typeof gear & { alchemy?: number }).alchemy],
  ] as const;

  return (
    <div className="space-y-3">
      {castle.viewedHeroId && castle.selected.isError && <div role="alert" className="text-xs"><p>{langRu ? "Не удалось проверить активного героя. Изменение экипировки временно недоступно." : "Unable to verify the active hero. Equipment changes are temporarily unavailable."}</p><button data-game-button="secondary" type="button" className="min-h-11 text-gold" onClick={() => void castle.selected.refetch()}>{langRu ? "Повторить" : "Retry"}</button></div>}
      {/* Почему мест столько: иначе разное число ячеек у двух героев выглядит
          сбоем, а не наградой за редкость. */}
      {!paperDoll && <p className="text-[10px] text-muted-foreground">
        {t("braid.gear_slots_count", {
          n: slots.length,
          rarity: metaLabel(gear.rarity, lang),
        })}
      </p>}

      {/* «Надеть лучшее» стоит НАД сеткой: владелец просил видеть стрелку вверх
          сразу, а не после пролистывания четырнадцати мест. «?? 0» не
          перестраховка — суточный кэш (yuplink-rq-cache) хранит ответ БЕЗ
          bestGain, и до первого рефетча кнопка обязана вести себя как «улучшать
          нечего», а не звать сервер впустую. */}
      {!castle.gearReadOnly && (
        <BestGearButton
          beforeAction={castle.guardGear}
          gain={gear.bestGain ?? 0}
          disabled={!atCastle}
          onDone={() => setOpen(null)}
        />
      )}

      {paperDoll && <div data-hero-gear-totals aria-label={langRu ? "Итоговые характеристики героя" : "Hero total stats"}>
        {gearTotals.map(([label, value]) => <div data-hero-gear-total key={label}>
          <span>{label}</span><strong>{value == null ? "—" : Math.round(value)}</strong>
        </div>)}
      </div>}

      {/* Комплекты — сразу под «лучшим»: игрок приходит сюда переодеться, и
          сохранённый набор надевается быстрее, чем перебираются места. */}
      {!paperDoll && !castle.gearReadOnly && <GearPresets beforeAction={castle.guardGear} disabled={!atCastle} />}

      {paperDoll ? (
        <GearPaperDoll containers={containers} slots={slots} selectedKey={open} onSelect={setOpen} slotDetails={slotDetails} race={race} onNavigate={onNavigate} referenceLayout={referenceLayout} />
      ) : (
        <GearSlotGrid slots={slots} available={available} selectedKey={open} onSelect={setOpen} />
      )}



      {paperDoll && <GearPresets beforeAction={castle.guardGear} disabled={!atCastle || castle.gearReadOnly} inactiveHero={castle.selected.isSuccess && castle.gearReadOnly} referenceLayout={referenceLayout} />}

      {!paperDoll && slotDetails}

      {noSlot.length > 0 && (
        <div className="rounded-2xl border border-dashed border-destructive/40 p-3">
          <div className="text-[11px] font-bold text-destructive">
            {t("braid.gear_no_slot_block")}
          </div>
          <ul className="mt-1 space-y-0.5">
            {noSlot.map((i) => (
              <li key={i.itemId} className="truncate text-[10px] text-muted-foreground">
                {stripStatSuffix(i.name)}
                {i.count > 1 ? ` ×${i.count}` : ""} —{" "}
                {i.blocked === "unknown_slot"
                  ? t("braid.gear_unknown_slot", { slot: i.slot ?? "" })
                  : t("braid.gear_no_slot")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
