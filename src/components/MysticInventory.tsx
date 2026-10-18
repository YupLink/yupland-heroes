// Инвентарь: артефакты/герои (квадратные карточки, как фишки). Клик по
// карточке — детальная карточка с описанием. Верхняя подвкладка «Инвентарь»
// в разделе «Фишки». Мистик-боксы теперь отдельно, в «Паки» (см.
// MysticBoxesSection) — здесь только уже открытые предметы, без дублей.
// Карточки вынесены в MysticInventoryCards.tsx (§13 — место под фильтры).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronDown, Backpack, X } from "lucide-react";
import { listMyItems } from "@/server/api/items";
import { listMyHeroes } from "@/server/api/heroes-read";
import { useNowTick } from "@/components/chips/chipBusy";
import { heroRestView } from "@/components/heroes/heroRestView";
import { heroResting } from "@/lib/fieldRecall";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { metaLabel, ARTIFACT_SLOTS } from "@/components/heroMeta";
import { useLang, useT } from "@/lib/i18n";
import { ItemSquare, ItemDetail, type Item } from "@/components/MysticInventoryCards";
import { BackpackGrid } from "@/components/beta-raid/BackpackGrid";

type KindFilter = "all" | "hero" | "artifact";

/** Ячейка «Рюкзак» — первая в гриде инвентаря, открывает попап с рюкзаком. */
function BackpackCell({
  occupied,
  capacity,
  label,
  onOpen,
}: {
  occupied: number;
  capacity: number;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-gold/40 bg-gold/10 p-2 text-gold"
    >
      <Backpack className="h-7 w-7" />
      <span className="text-[11px] font-bold leading-none">{label}</span>
      <span className="text-[10px] font-semibold tabular-nums text-gold/80">
        {occupied}/{capacity}
      </span>
    </button>
  );
}

export function MysticInventory() {
  const lang = useLang();
  const t = useT();
  const items = useQuery({
    queryKey: ["my-game-items"],
    queryFn: () => listMyItems(),
  });
  // Рюкзак героя — первой ячейкой инвентаря, открывается попапом. Тот же ключ,
  // что и везде: покупка в маркете/смена героя перерисуют без F5.
  const bp = useQuery({ queryKey: ["my-hero-backpack"], queryFn: () => getMyBackpack() });
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  // Подтип артефакта (слот): "Голова"/"Тело"/… — второй уровень фильтра,
  // показывается только когда выбраны «Арты». null = все слоты.
  const [artSlot, setArtSlot] = useState<string | null>(null);

  const itemList = items.data ?? [];
  const empty = itemList.length === 0;

  // Слоты артефактов со счётчиком. Показываем ВЕСЬ канон-набор
  // (ARTIFACT_SLOTS), а не только присутствующие у игрока — владелец хотел
  // видеть все типы (голова/тело/оружие/…), даже пустые. Порядок канона.
  const artSlots = useMemo(() => {
    const cnt = new Map<string, number>();
    for (const it of itemList) {
      if (it.kind === "artifact" && it.slot) {
        cnt.set(it.slot, (cnt.get(it.slot) ?? 0) + 1);
      }
    }
    return ARTIFACT_SLOTS.map((slot) => ({ slot, n: cnt.get(slot) ?? 0 }));
  }, [itemList]);

  const counts = useMemo(() => {
    let hero = 0;
    let art = 0;
    for (const it of itemList) {
      if (it.kind === "hero") hero++;
      else if (it.kind === "artifact") art++;
    }
    return { all: itemList.length, hero, art };
  }, [itemList]);

  // Список героев знает у каждой копии предмета её экземпляр: точный уровень
  // и отдых (снят с грядки издалека). Уровень из списка предметов раздаётся
  // копиям по порядку получения — для пачки годился, а серая плитка отдельной
  // копии показала бы чужой уровень. Список перечитывается сам после снятия.
  const heroes = useQuery({ queryKey: ["my-heroes"], queryFn: () => listMyHeroes() });
  const byItem = useMemo(() => {
    const m = new Map<string, { level: number; restUntil: string | null }>();
    for (const h of heroes.data ?? []) {
      if (h.itemId) m.set(h.itemId, { level: Number(h.level) || 0, restUntil: h.restUntil });
    }
    return m;
  }, [heroes.data]);
  // Тик — только пока кто-то отдыхает: иначе сетке незачем перерисовываться.
  const anyResting = useMemo(() => [...byItem.values()].some((v) => !!v.restUntil), [byItem]);
  const now = useNowTick(anyResting ? 10_000 : 600_000);

  // Фильтр + стак одинаковых предметов в ячейку с ×к-вом.
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; sample: Item; count: number }>();
    for (const raw of itemList) {
      if (kind !== "all" && raw.kind !== kind) continue;
      if (kind === "artifact" && artSlot && raw.slot !== artSlot) continue;
      const own = raw.kind === "hero" ? byItem.get(raw.id) : undefined;
      const it = own ? ({ ...raw, heroLevel: own.level } as Item) : raw;
      // Герои одного вида, но разного уровня — разные пачки: прокачал одного
      // из пяти, значит «кабан 3 lvl» и «кабан 1 lvl ×4».
      // Отдыхающий — своей плиткой: серый, с таймером, в пачку не сливается.
      const key =
        it.kind === "hero" && heroResting(own?.restUntil, now)
          ? `rest|${it.id}`
          : it.kind === "hero"
            ? `${it.templateId}|${(it as { heroLevel?: number | null }).heroLevel ?? 0}`
            : it.templateId || it.id;
      const g = m.get(key);
      if (g) g.count++;
      else m.set(key, { key, sample: it, count: 1 });
    }
    return Array.from(m.values());
  }, [itemList, kind, artSlot, byItem, now]);

  const selectCls =
    "appearance-none rounded-full border border-border bg-secondary/40 py-1.5 pl-3 pr-7 text-xs font-semibold text-foreground outline-none focus:border-gold/50";

  return (
    <div className="space-y-3 pt-2">
      {/* Фильтры — компактные раскрывающиеся списки, а не ряд кнопок */}
      {!empty && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as KindFilter);
                setArtSlot(null);
              }}
              className={selectCls}
            >
              <option value="all">Все · {counts.all}</option>
              <option value="hero">Герои · {counts.hero}</option>
              <option value="artifact">Арты · {counts.art}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          {kind === "artifact" && (
            <div className="relative">
              <select
                value={artSlot ?? ""}
                onChange={(e) => setArtSlot(e.target.value || null)}
                className={selectCls}
              >
                <option value="">Все слоты · {counts.art}</option>
                {artSlots.map(({ slot, n }) => (
                  <option key={slot} value={slot}>
                    {metaLabel(slot, lang)} · {n}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {items.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Рюкзак — всегда первой ячейкой, даже когда предметов нет. */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <BackpackCell
              occupied={bp.data?.occupied ?? 0}
              capacity={bp.data?.capacity ?? 0}
              label={t("chips.sub_backpack")}
              onOpen={() => setBackpackOpen(true)}
            />
            {groups.map((g) => (
              <ItemSquare
                key={g.key}
                it={g.sample}
                count={g.count}
                rest={heroRestView(byItem.get(g.sample.id)?.restUntil, now, t)}
                onOpen={() => setDetail(g.sample)}
              />
            ))}
          </div>
          {!empty && groups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-xs text-muted-foreground">
              Ничего по фильтру
            </div>
          )}
        </>
      )}

      {detail && <ItemDetail it={detail} onClose={() => setDetail(null)} />}

      {/* Попап рюкзака: та же сетка ячеек, что в окне героя. */}
      {backpackOpen && (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setBackpackOpen(false)}
        >
          <div
            className="flex max-h-[calc(100dvh-96px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:max-h-[85dvh] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
              <h3 className="flex items-center gap-1.5 font-display text-base font-bold">
                <Backpack className="h-4 w-4 text-gold" />
                {t("chips.sub_backpack")}
              </h3>
              <button
                type="button"
                onClick={() => setBackpackOpen(false)}
                aria-label={t("common.close")}
                className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:pb-4">
              <BackpackGrid data={bp.data} loading={bp.isLoading} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
