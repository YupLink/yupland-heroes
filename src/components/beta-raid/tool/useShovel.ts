// Лопата в руках на карте (ПРАВИЛА §8.24): тап по клетке даёт плашке маршрута
// ещё одну кнопку — «Копать» / «Закопать» / «Выкопать» (shovelOffer). Рядом
// (своя или соседняя клетка) кнопка делает дело сразу, далеко — строит маршрут к
// соседней клетке с плашкой «<дело> · N шагов ⚡X» (энергия пути и 2 за лопату),
// и по приходу дело делается само. Своя клетка без маршрута — плашка из одной
// кнопки. Лопаты в руках нет — кнопок нет: тап работает как раньше.
// 12.11.2026 (тестер: «два раза два тыка, хотя лопата уже в руках»): «Копать»
// издалека ведёт героя сразу, без второй плашки «Копать · N шагов» (дверь на
// пути — плашка, как у walkTo); двойной тап по клетке — то же, что «Копать»,
// одним жестом (как земля и динамит в руке, DOUBLE_TAP_MS).
//
// Вызывается из useLootBags (экран рейда за лимитом строк — туда ни строки):
// тап проходит через него первым; прибытие маршрута с делом лопаты (kind
// "dig") useApproachDone отдаёт сюда же через shovelOffer.arrive.
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack } from "@/lib/query";
import { HARVEST_KEY } from "@/components/beta-raid/hud/useHarvest";
import { resPriceText } from "@/components/beta-raid/market/priceLabel";
import { numText } from "@/components/beta-raid/market/num";
import { newOpId } from "@/lib/opId";
import { serverErrorText } from "@/lib/serverErrorText";
import { DIG_ENERGY, type LootBagMarks } from "@/lib/lootBag";
import type { ChestMarks } from "@/lib/magicChest";
import { digGround } from "@/server/api/beta-raid/main-tool/ground-dig";
import { buryHole } from "@/server/api/beta-raid/main-tool/hole-bury";
import { buryChest } from "@/server/api/beta-raid/plain-chest/pchest-dig";
import { getLootBagsAt } from "@/server/api/beta-raid/loot-bag/bag-read";
import { DIRS, isWaterCell } from "@/components/beta-raid/usePathfinding";
import type { TerrainInfo } from "@/components/beta-raid/hexStepCost";
import type { MapLike } from "@/components/beta-raid/patchMapCache";
import type { Cell } from "@/components/beta-raid/unpackMap";
import type { PendingAction } from "@/components/beta-raid/useBetaMovement";
import type { ShipMark } from "@/components/beta-raid/useShips";
import { useLootBagActions } from "@/components/beta-raid/loot-bag/useLootBagActions";
import { refreshPlain } from "@/components/beta-raid/plain-chest/plainChestLive";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { invalidateEnergy } from "@/components/beta-raid/open-pass/useOpenStorage";
import { useMainTool } from "@/components/beta-raid/tool/useMainTool";
import {
  shovelOffer,
  type ShovelAct,
  type ShovelOffer,
} from "@/components/beta-raid/tool/shovelOffer";
import { shovelActAt } from "@/components/beta-raid/tool/shovelAct";
import { inBuildingBlock } from "@/components/beta-raid/mergeBlocks";
import { storeOf } from "@/components/beta-raid/mapStore";
import { getHand } from "@/components/beta-raid/hand/handStore";
import { DOUBLE_TAP_MS } from "@/components/beta-raid/hand/handTap";

type At = { q: number; r: number };

export function useShovel(o: {
  pos: At | null;
  cells: Record<string, Cell>;
  bags: LootBagMarks;
  chests: ChestMarks | undefined;
  ships: Map<string, ShipMark>;
  /** Ямки («q,r»): там «Копать» нет, только «Закопать» её в кучку (§8.24 п. 6б). */
  holes: ReadonlySet<string>;
  approachCell: (
    q: number,
    r: number,
    action?: PendingAction | null,
    failKey?: string,
    anySide?: boolean,
    go?: boolean,
  ) => Promise<boolean> | void;
  clearPending: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();
  const inHand = useMainTool().main?.shovel === true;
  const bagAct = useLootBagActions();
  const settle = () => {
    invalidateBackpack(qc);
    invalidateEnergy(qc);
  };
  const ground = useMutation({
    mutationFn: (v: At) => digGround({ data: { ...v, op: newOpId() } }),
    onSuccess: (res) => {
      // Клад дня (§8.117) — в «Добычу», приз по «Забрать»; находка — мешочком в ямке,
      // что внутри — при «Открыть» (§8.24 п. 6б).
      const tr = res.treasure;
      if (tr) {
        // Полученный токен — токеном (resPriceText звездочнику пишет цену DARAI в звёздах).
        const prize =
          tr.resource === "token"
            ? `${numText(tr.amount)} ${tr.token ?? ""}`
            : resPriceText(t, tr.amount, tr.resource, tr.token, tr.name);
        toast.success(t("treasure.found", { prize }));
        void qc.invalidateQueries({ queryKey: HARVEST_KEY });
      } else if (res.found > 0) toast.success(t("dig.found_bag"));
      else toast(t("dig.nothing"));
      // Ямка на клетке (02.10) — сразу, не дожидаясь события.
      invalidateBags(qc);
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: settle,
  });
  const hole = useMutation({
    mutationFn: (v: At) => buryHole({ data: { ...v, op: newOpId() } }),
    onSuccess: () => {
      toast.success(t("dig.hole_buried"));
      invalidateBags(qc);
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: settle,
  });
  const chest = useMutation({
    mutationFn: (v: At) => buryChest({ data: { ...v, op: newOpId() } }),
    onSuccess: () => toast.success(t("pchest.buried_toast")),
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
    onSettled: () => {
      refreshPlain(qc, true);
      invalidateEnergy(qc);
    },
  });

  const actAt = (q: number, r: number) => {
    const key = `${q},${r}`;
    const terrains = ((qc.getQueryData(["beta-raid-map"]) as MapLike)?.terrains ?? {}) as Record<
      string,
      TerrainInfo
    >;
    const cell = o.cells[key];
    return shovelActAt({
      cell,
      bag: o.bags[key],
      chest: o.chests?.[key],
      ship: o.ships.has(key),
      water: isWaterCell(cell, terrains),
      inBuilding: inBuildingBlock(storeOf(o.cells), q, r),
      hole: o.holes.has(key),
    });
  };
  const near = (c: At) =>
    !!o.pos &&
    ((o.pos.q === c.q && o.pos.r === c.r) ||
      DIRS.some((d) => o.pos!.q + d.q === c.q && o.pos!.r + d.r === c.r));

  /**
   * Сделать подтверждённое дело (want). На клетке уже другое (бугорок выкопали,
   * мешочек забрали) — ничего не делаем и не платим: «цели больше нет».
   */
  const run = async (c: At, want: ShovelAct) => {
    const act = actAt(c.q, c.r);
    if (!act || act !== want) return void toast(t("braid.target_gone"));
    if (act === "dig") return void ground.mutate(c);
    const key = `${c.q},${c.r}`;
    // Пустая ямка — закопать её саму (кучка); мешочек и сундук — как раньше.
    if (!o.bags[key] && !o.chests?.[key] && o.holes.has(key)) return void hole.mutate(c);
    if (!o.bags[key]) return void chest.mutate(c);
    // Мешочек или бугорок: какой именно — окно клетки (сервер отдаёт его вплотную).
    const view = await getLootBagsAt({ data: c }).catch((e: unknown) => {
      toast.error(humanError(e));
      return null;
    });
    const list = Array.isArray(view?.bags) ? view.bags : [];
    const bag = list.find((b) => b.buried === (act === "unbury"));
    if (!bag) return void toast(t("braid.target_gone"));
    bagAct.dig.mutate({ bagId: bag.id, bury: act === "bury", at: c });
  };

  // Кнопка плашки: рядом — дело сразу, далеко — маршрут к соседней клетке с
  // этим делом (предложение остаётся: из него плашка берёт надпись).
  const goRef = useRef<(offer: ShovelOffer) => boolean>(() => false);
  /** Дело маршрута «<дело> · N шагов»: клетка и что подтвердили. */
  const heading = useRef<{ key: string; act: ShovelAct } | null>(null);
  goRef.current = (offer) => {
    const c = { q: offer.q, r: offer.r };
    if (near(c)) {
      shovelOffer.set(null);
      void run(c, offer.act);
      return true;
    }
    heading.current = { key: `${c.q},${c.r}`, act: offer.act };
    const action = { kind: "dig" as const, q: c.q, r: c.r, extraCost: DIG_ENERGY };
    const walk = o.approachCell(c.q, c.r, action, undefined, undefined, true);
    if (!walk) {
      shovelOffer.set({ ...offer, near: false, here: false });
      return false;
    }
    void walk.then((ok) => {
      if (ok) return arriveRef.current(c);
      heading.current = null;
      shovelOffer.set(null);
    });
    return true;
  };
  // Пришли маршрутом: делаем ровно то дело, что подтвердили на плашке.
  const arriveRef = useRef<(c: At) => void>(() => {});
  arriveRef.current = (c) => {
    const want = heading.current?.key === `${c.q},${c.r}` ? heading.current.act : null;
    heading.current = null;
    shovelOffer.set(null);
    if (want) void run(c, want);
    else toast(t("braid.target_gone"));
  };
  useEffect(() => {
    shovelOffer.setRunner({
      go: (offer) => goRef.current(offer),
      arrive: (c) => arriveRef.current(c),
    });
    return () => {
      shovelOffer.setRunner(null);
      shovelOffer.set(null);
    };
  }, []);

  // Герой сошёл с клетки — «копать под собой» больше не про эту клетку.
  const [pq, pr] = [o.pos?.q, o.pos?.r];
  useEffect(() => {
    const cur = shovelOffer.get();
    if (cur?.here && (cur.q !== pq || cur.r !== pr)) shovelOffer.set(null);
  }, [pq, pr]);

  /**
   * Любой тап: запомнить, что лопата сделает с клеткой. Своя пустая клетка —
   * тап обработан здесь (плашка из одной кнопки), иначе — идёт дальше как был.
   */
  const last = useRef<{ key: string; at: number } | null>(null);
  return (q: number, r: number): boolean => {
    // В руке земля или динамит — лопата в слоте не предлагает своего дела.
    const act = inHand && !getHand() ? actAt(q, r) : null;
    const here = !!o.pos && o.pos.q === q && o.pos.r === r && act === "dig";
    const offer = act ? { q, r, act, near: near({ q, r }), here } : null;
    shovelOffer.set(offer);
    const [key, now] = [`${q},${r}`, Date.now()];
    const prev = last.current;
    const double = !!offer && prev?.key === key && now - prev.at < DOUBLE_TAP_MS;
    last.current = double ? null : { key, at: now };
    if (!double || !offer) return here;
    // Второй тап по той же клетке: плашку первого тапа долой, дело — сразу.
    o.clearPending();
    goRef.current(offer);
    return true;
  };
}
