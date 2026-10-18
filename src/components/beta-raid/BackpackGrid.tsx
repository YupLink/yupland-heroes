// Рюкзак героя одной сеткой ячеек. Общий презентационный блок на ТРИ места —
// вкладку в инвентаре, вкладку замка и секцию окна героя с карты, — чтобы
// «сколько ячеек, что в каждой, N/20» рисовалось везде одинаково и правилось
// в одном файле.
//
// Ничего не считает и не ходит в сеть: capacity/occupied/trade и стеки приходят
// готовыми из getMyBackpack (та же арифметика backpackCells, что у сервера).
// Ниже рюкзака — сумка зелий: товары с галочкой «зелье», своя ёмкость
// (редкость героя + Алхимия), та же ячейка на 20 штук. Зелья живут только в
// ней (правило владельца 29.09): в рюкзаке их не бывает, а перебор сверх
// ёмкости сумка показывает как есть.
// Своей прокрутки нет намеренно: во всех трёх местах скроллит родитель
// (страница или модалка), а второй вложенный скролл на телефоне ловит палец —
// ровно та беда, из-за которой её убрали в CastleGearTab.
//
// Сама клетка живёт в BackpackCell.tsx, сетка — в BackpackCellsGrid.tsx,
// раскладка стеков — в backpackCellList.ts: файл упирался в лимит, а рисование
// и арифметика правятся отдельно от логики «что перечитать после действия».
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Coins, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { BackpackDiscardModal } from "./BackpackDiscardModal";
import { BackpackBoostModal } from "./BackpackBoostModal";
import { BackpackCellsGrid } from "./BackpackCellsGrid";
import { bagLayout } from "./backpackCellList";
import { discardBackpackStack } from "@/server/api/beta-raid/market-backpack-read";
import { applyItemBoost } from "@/server/api/beta-raid/boost-item";
import { newOpId } from "@/lib/opId";
import { useLang } from "@/lib/i18n";
import { boostRollText } from "@/lib/hero/boost";
import { invalidateHeroQueries, invalidateBackpack } from "@/lib/query";
import { formatQty } from "@/lib/formatQty";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import type { BackpackView } from "@/server/api/beta-raid/market-backpack";
import { guardStacks, isChestStack } from "@/components/beta-raid/chest/useChestActions";
import { ChestPlacePicker } from "@/components/beta-raid/chest/ChestPlacePicker";
import { PlainChestPlacePicker } from "@/components/beta-raid/plain-chest/PlainChestPlacePicker";
import { ToolCard } from "@/components/beta-raid/tool/ToolCard";

export function BackpackGrid({
  data,
  compartment,
  paged = false,
  loading,
  readOnly = false,
  allowUse = false,
  beforeUse,
}: {
  data?: BackpackView;
  compartment?: "backpack" | "potions";
  paged?: boolean;
  loading?: boolean;
  readOnly?: boolean;
  allowUse?: boolean;
  beforeUse?: () => Promise<void>;
}) {
  const canUseBoost = !readOnly || (allowUse && !!beforeUse);
  const guard = () => {
    if (readOnly) throw new Error("Read only / Только просмотр");
  };
  const t = useT();
  const qc = useQueryClient();
  // Какой ВИД сейчас выбрасывают. Спрашиваем не только «точно?», но и
  // «сколько»: стек занимает несколько ячеек, и урна на ячейке раньше уносила
  // весь вид целиком.
  const [discarding, setDiscarding] = useState<string | null>(null);
  // У какого товара-буста открыта карточка с описанием и полным разбором.
  const [showing, setShowing] = useState<string | null>(null);
  // У какого инструмента открыта карточка «Сделать основным» (§8.24).
  const [toolCard, setToolCard] = useState<string | null>(null);
  const [bagPage, setBagPage] = useState(0);
  useEffect(() => setBagPage(0), [data?.heroId, compartment]);
  const lang: "ru" | "en" = useLang() === "en" ? "en" : "ru";
  // Ключ нажатия — один на окно выброса: повтор после обрыва не выбросит дважды.
  const discardOp = useRef(newOpId());
  // Выброшенное падает мешочком на клетке героя (§8.21): слой мешочков — сразу.
  const discard = useMutation({
    mutationFn: (v: { stackKey: string; qty: number }) => {
      guard();
      return discardBackpackStack({ data: { ...v, op: discardOp.current } });
    },
    onSuccess: (res) => {
      if (res.put > 0) toast.success(t("bag.discarded", { n: formatQty(res.put) }));
      else toast(t("bag.discard_worn_gone"));
      invalidateBackpack(qc);
      invalidateBags(qc);
      setDiscarding(null);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const openDiscard = (key: string | null) => {
    discardOp.current = newOpId();
    setDiscarding(key);
  };

  // Использование товара-буста: штуки уходят, прибавка висит заданные админом
  // минуты и снимается сама. Можно выпить несколько разом (qty из карточки).
  const use = useMutation({
    mutationFn: async (v: { stackKey: string; qty: number }) => {
      if (!canUseBoost) throw new Error("Read only / Только просмотр");
      if (beforeUse) await beforeUse();
      return applyItemBoost({ data: { stackKey: v.stackKey, op: newOpId(), qty: v.qty } });
    },
    onSuccess: (res) => {
      // Товар мог дать несколько прибавок разом — перечисляем все.
      const line = res.rolls.map((r) => boostRollText(r, lang)).join(" · ");
      toast.success(t("braid.boost_item_done", { hero: res.heroName ?? "", line }));
      setShowing(null);
      // Рюкзак похудел, а герой окреп — оба экрана обязаны обновиться без F5.
      invalidateBackpack(qc);
      // Значок буста живёт в состоянии рейда — обновляем и его, иначе таймер
      // появится только со следующим шагом.
      invalidateHeroQueries(qc, ["beta-raid-state"]);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Магический сундук ставится на клетку под героем — с охранником-боссом из
  // рюкзака или без (вне рейда — отказ тостом): «Поставить» открывает выбор.
  // Обычный сундук (29.09) — под себя или на соседнюю клетку: выбор клетки.
  const [placing, setPlacing] = useState<string | null>(null);
  const [placingPlain, setPlacingPlain] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-gold" />
      </div>
    );
  }

  // Нет выбранного героя — рюкзака нет: у рюкзака владелец — герой.
  if (!data || !data.heroId) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        {t("braid.backpack_no_hero")}
      </p>
    );
  }

  const bonus = Math.floor(Math.max(0, data.trade) / 10);
  const potionBonus = Math.floor(Math.max(0, data.alchemy) / 10);
  const mainKey = typeof data.mainTool === "string" ? data.mainTool : null;
  const layout = bagLayout(data.stacks, data.capacity, data.potionCapacity, mainKey);
  const showBackpack = compartment !== "potions";
  const showPotions = compartment !== "backpack";
  const bagPages = paged && compartment === "backpack" ? Math.max(1, Math.ceil(layout.backpack.length / 8)) : 1;
  const currentBagPage = Math.min(bagPage, bagPages - 1);
  const visibleBackpack = bagPages > 1 ? layout.backpack.slice(currentBagPage * 8, (currentBagPage + 1) * 8) : layout.backpack;
  const bosses = guardStacks(data.stacks);
  const grid = {
    lang,
    readOnly,
    allowUse: canUseBoost,
    busy: use.isPending,
    onTrash: openDiscard,
    onUse: (stackKey: string) => use.mutate({ stackKey, qty: 1 }),
    onInfo: (key: string) => {
      const s = data.stacks.find((x) => x.stackKey === key);
      if (s?.boost?.length) setShowing(key);
      else if (s?.tool || s?.shovel) setToolCard(key);
    },
    chestKeys: new Set(
      data.stacks.filter((s) => isChestStack(s) || s.plainChest === true).map((s) => s.stackKey),
    ),
    onPlace: (key: string) =>
      data.stacks.find((s) => s.stackKey === key)?.plainChest ? setPlacingPlain(key) : setPlacing(key),
  };
  const stackBeing = data.stacks.find((s) => s.stackKey === discarding) ?? null;
  const stackShown = data.stacks.find((s) => s.stackKey === showing) ?? null;
  const stackTool = data.stacks.find((s) => s.stackKey === toolCard && s.count >= 1) ?? null;

  return (
    <div data-tavern-bag={compartment} className="space-y-3">
      {showBackpack && <>
      {/* Шапка: занято/ёмкость + Торговля (стат виден игроку) + вклад в ячейки. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-bold">
          {t("braid.backpack_cells", { occupied: data.occupied, capacity: data.capacity })}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-bold text-gold">
          <Coins className="h-3 w-3" />
          {t("braid.trade_stat")}: {data.trade}
        </span>
        {bonus > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {t("braid.backpack_trade_bonus", { n: bonus })}
          </span>
        )}
      </div>

      {data.occupied === 0 && (
        <p className="text-[11px] text-muted-foreground">{t("braid.backpack_empty")}</p>
      )}

      <BackpackCellsGrid cells={visibleBackpack} lockedCount={bagPages > 1 ? 8 - visibleBackpack.length : 0} {...grid} />
      {bagPages > 1 && <nav data-bag-pages aria-label={lang === "ru" ? "Страницы рюкзака" : "Backpack pages"}>
        <button type="button" disabled={currentBagPage === 0} aria-label={lang === "ru" ? "Предыдущая страница рюкзака" : "Previous backpack page"} onClick={() => setBagPage(currentBagPage - 1)}><ChevronLeft aria-hidden="true" /></button>
        <span aria-live="polite">{currentBagPage + 1} / {bagPages}</span>
        <button type="button" disabled={currentBagPage === bagPages - 1} aria-label={lang === "ru" ? "Следующая страница рюкзака" : "Next backpack page"} onClick={() => setBagPage(currentBagPage + 1)}><ChevronRight aria-hidden="true" /></button>
      </nav>}
      </>}
      {showPotions && <>

      {/* Сумка зелий: занято/ёмкость + Алхимия и её вклад в ячейки. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="inline-flex items-center gap-1 text-xs font-bold">
          <FlaskConical className="h-3.5 w-3.5 text-gold" />
          {t("braid.potion_bag")}
        </span>
        <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-bold">
          {t("braid.backpack_cells", {
            occupied: data.potionOccupied,
            capacity: data.potionCapacity,
          })}
        </span>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-bold text-gold">
          {t("braid.alchemy_stat")}: {data.alchemy}
        </span>
        {potionBonus > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {t("braid.potion_alchemy_bonus", { n: potionBonus })}
          </span>
        )}
      </div>
      <BackpackCellsGrid cells={layout.potions} {...grid} />
      </>}

      {/* Карточка буста: описание, все прибавки и «Использовать». */}
      {stackShown && stackShown.boost && (
        <BackpackBoostModal
          name={stackShown.name}
          image={stackShown.image}
          total={stackShown.count}
          effects={stackShown.boost}
          lang={lang}
          busy={use.isPending}
          useAllowed={canUseBoost}
          onUse={(qty) => use.mutate({ stackKey: stackShown.stackKey, qty })}
          onClose={() => setShowing(null)}
        />
      )}

      {stackTool && (
        <ToolCard
          stack={stackTool}
          main={stackTool.stackKey === mainKey}
          readOnly={readOnly}
          onClose={() => setToolCard(null)}
        />
      )}

      {!readOnly && placing && (
        <ChestPlacePicker chestKey={placing} bosses={bosses} onClose={() => setPlacing(null)} />
      )}
      {!readOnly && placingPlain && (
        <PlainChestPlacePicker stackKey={placingPlain} onClose={() => setPlacingPlain(null)} />
      )}

      {/* Окно выброса: имя, сколько лежит, ползунок количества. */}
      {!readOnly && stackBeing && (
        <BackpackDiscardModal
          name={stackBeing.name}
          image={stackBeing.image}
          total={stackBeing.count}
          durability={stackBeing.durability ?? null}
          busy={discard.isPending}
          onDiscard={(qty) => discard.mutate({ stackKey: stackBeing.stackKey, qty })}
          onClose={() => setDiscarding(null)}
        />
      )}
    </div>
  );
}
