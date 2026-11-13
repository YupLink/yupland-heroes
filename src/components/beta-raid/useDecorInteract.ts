import { TOOL_ACTION_MS } from "./heroActionTiming";
// Декор со «взаимодействием» на карте игрока (владелец, 25.09): тап рядом —
// заплатить энергию и уничтожить, товар уходит в «Добычу»; тап издалека —
// «дойти и уничтожить» одним подтверждением с общей ценой, как у лута.
//
// Декор с инструментом (27.09, «1 топор = 1 декор») молча не собирается:
// рядом — окно «Срубить (−1 Топор)», издалека — маршрут «Срубить · N шагов ⚡X»,
// а по прибытии рубка сразу. У инструмента с износом (28.09) окно пишет «−25%
// прочности» и прочность из рюкзака.
//
// Основной инструмент (§8.24): рубит только инструмент в руках (или единственный
// такой, пока в руках пусто). Есть, но в руках другое — окно сразу, с «Взять
// <Топор>»; нет вовсе — окно с неактивной «Требуется <Топор>».
//
// Несколько инструментов (05.10): подходит любой из списка декора — в руках из
// списка, то он; иначе первый по порядку, который есть (lib/raid/decorTools).
// Окно пишет имя и картинку именно его; нет ни одного — «Требуется Топор или Кирка».
//
// Руками (§8.56; с 29.10 — и при топоре): декор берёт деревянный или каменный
// топор — в окне всегда «Срубить руками» (DecorHandChop), а топор не взят в руки
// сам (автовыбор) — окно и издалека: чем рубить. Издалека руками — маршрут, по
// прибытии рубка руками без второго окна, даже при топоре (клетка — в handAt).
// Из окна издалека (13.11) — сразу в путь, цена дороги в кнопке (decorWalk).
//
// Вынесено отдельным хуком: useCellTap и BetaRaidScreen упёрлись в лимит строк,
// туда уходит по одной строке-вызову.
import { createElement, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack } from "@/lib/query";
import { formatQty } from "@/lib/formatQty";
import { interactDecor, type DecorInteractView } from "@/server/api/beta-raid/decor-interact";
import { chooseDecorTool, decorToolsOf, orList, type ToolChoice } from "@/lib/raid/decorTools";
import { handChopEnergy, HAND_CHOP_HUNGRY } from "@/lib/raid/handChop";
import { scaleEnergy } from "@/lib/raid/island/energy";
import { useEnergyMult } from "@/components/beta-raid/useEnergyMult";
import { patchMapCache, readCellDetails, type MapLike } from "./patchMapCache";
import { DIRS } from "./usePathfinding";
import type { Cell } from "./unpackMap";
import { canWalkAndAct, walkEnergy, walkToDecor, type DecorWalkOpts, type Step } from "./decorWalk";
import { DecorChopDialog, type DecorChopProps } from "./DecorChopDialog";
import { DecorHandChop } from "./DecorHandChop";
import { useInteractiveDecor } from "./useInteractiveDecor";
import { announceDropped, invalidateBags } from "./loot-bag/lootBagLive";
import { useMainTool } from "./tool/useMainTool";
import { useChopStrike } from "./useChopStrike";

type Pos = { q: number; r: number } | null;
type Target = { q: number; r: number; decorId: string };
/** hand — рубить руками (§8.56). */
type Chop = Target & { hand?: boolean };
/** Окно рубки: far — открыто издалека, path — маршрут подхода (цена дороги). */
type Offer = Target & { far?: boolean; path?: Step[] | null };

export function useDecorInteract(opts: { playerPos: Pos } & DecorWalkOpts) {
  const qc = useQueryClient();
  const strike = useChopStrike();
  const t = useT();
  const list = useInteractiveDecor();
  // Рюкзак (что в руках) нужен, только если на карте есть декор с инструментом.
  const needsBag = Object.values(list.data ?? {}).some((c) => decorToolsOf(c).length > 0);
  const tool = useMainTool(needsBag);
  const mult = useEnergyMult(); // остров — рубка в 10 раз дешевле (цены в окне)
  // far — окно открыто издалека (инструмента не было в руках): «Срубить» тогда ведёт.
  const [chop, setChop] = useState<Offer | null>(null);
  // «q,r» декора, к которому идём рубить руками: по прибытии — сразу рубка.
  const handAt = useRef<string | null>(null);

  /**
   * Чем рубить: ok — рубит он, idle — есть, «Взять» его, none — нет ни одного.
   * Стопка — по ключу (канон вида с сервера), а не по имени: другой свой товар
   * с тем же именем топором не станет. Решает сервер; здесь — только вид окна.
   * Рюкзак ещё не приехал — не запрещаем.
   */
  const choiceOf = (conf: DecorInteractView): ToolChoice => {
    const tools = decorToolsOf(conf);
    if (!tool.ready) return { state: "ok", tool: tools[0] ?? null };
    return chooseDecorTool(tool.main?.stackKey ?? null, tool.stacks, tools);
  };
  const stateOf = (conf: DecorInteractView) => choiceOf(conf).state;
  /** Рубит инструмент, который игрок сам взял в руки (не автовыбор). */
  const held = (conf: DecorInteractView) =>
    !!tool.main && stateOf(conf) === "ok" && choiceOf(conf).tool?.key === tool.main.stackKey;
  const hasTool = (conf: DecorInteractView | undefined) => decorToolsOf(conf).length > 0;

  const run = useMutation({
    mutationFn: (v: Chop) => interactDecor({ data: v }),
    onSuccess: (res, v) => {
      const shown = strike(res.toolName, res.hand, { q: v.q, r: v.r, decorId: v.decorId });
      setChop(null);
      // Keep the original resource visible while the tool or hand strike is shown.
      // Never remove a replacement decoration that appears in the same cell.
      const removeDecor = () =>
        qc.setQueryData(["beta-raid-map"], (old: MapLike) =>
          old && readCellDetails(old, v.q, v.r).decorationId === v.decorId
            ? patchMapCache(old, { q: v.q, r: v.r, decorationId: null })
            : old,
        );
      // Сначала срубил, потом «добавлено в рюкзак» (владелец, 13.11.2026): ресурс,
      // сообщение и рюкзак — по концу удара, а не в его начале. Энергия — сразу.
      void qc.invalidateQueries({ queryKey: ["my-energy"], refetchType: "all" });
      const done = () => {
        removeDecor();
        // В рюкзак — сколько влезло, остальное выпало мешочком на клетке (§8.21);
        // мешочек не упал (сбой базы) — остаток ждёт в «Добыче».
        const [dropped, queued] = [Number(res.dropped) || 0, Number(res.queued) || 0];
        const packed = res.amount - dropped - queued;
        const item = res.itemName;
        if (packed > 0) toast.success(t("braid.decor_done", { n: formatQty(packed), item }));
        if (queued > 0) toast.success(t("braid.decor_loot", { n: formatQty(queued), item }));
        announceDropped(qc, t, dropped);
        // Под деревом лежал мешочек или бугорок (дополнение №5) — слой сразу.
        if (res.covered) invalidateBags(qc);
        for (const key of [["beta-raid-state"], ["yupland-status"], ["raid-pending-rewards"]])
          void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
        // Инструмент потерял прочность (или штуку): рюкзак в обоих ответах.
        invalidateBackpack(qc);
      };
      if (shown) setTimeout(done, res.hand ? 3000 : TOOL_ACTION_MS);
      else done();
    },
    onError: (e: Error, v) => {
      // Нет инструмента или в руках другой (§8.24) — рюкзак перечитать: кнопки окна
      // покажут «Требуется» / «Взять».
      if (e.message === "braid.decor_need_tool" || e.message.startsWith("tool.not_main")) {
        invalidateBackpack(qc);
      }
      // Руками не хватило сытости — шкалу перечитать: кнопка станет неактивной.
      if (e.message.startsWith(HAND_CHOP_HUNGRY)) {
        void qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
      }
      if (e.message === "braid.decor_need_tool") {
        const names = decorToolsOf(list.data?.[v.decorId]).map((x) => x.name);
        toast.error(t("braid.decor_need_tool", { tool: orList(names, t("braid.decor_tool_or")) }));
        return;
      }
      toast.error(humanError(e));
    },
  });

  const act = (q: number, r: number, decorId: string, hand = false) => {
    if (!run.isPending) run.mutate({ q, r, decorId, hand });
  };

  /** Декор с инструментом предлагается окном, без инструмента — как раньше. */
  const offer = (q: number, r: number, decorId: string, far = false) => {
    if (!hasTool(list.data?.[decorId])) return act(q, r, decorId);
    setChop({ q, r, decorId, far, path: far ? opts.approachPath(q, r) : null });
  };

  /** Тап по клетке: true — это декор со взаимодействием, тап обработан. */
  const tap = (q: number, r: number, cell: Cell | undefined): boolean => {
    const id = cell?.decorationId;
    const conf = id ? list.data?.[id] : undefined;
    const pos = opts.playerPos;
    if (!id || !conf || !pos) return false;
    const near =
      (pos.q === q && pos.r === r) || DIRS.some((d) => pos.q + d.q === q && pos.r + d.r === r);
    // Нет в руках — сразу окно («Взять» / «Требуется»); рубится руками, а топор
    // не взят сам — окно: руками или топором.
    const ask = hasTool(conf) && (stateOf(conf) !== "ok" || (!!conf.hand && !held(conf)));
    if (near || ask) {
      offer(q, r, id, !near);
    } else {
      // Идём рубить инструментом: метка прерванного похода «руками» — долой.
      handAt.current = null;
      opts.approachCell(q, r, { kind: "decor", q, r, extraCost: conf.cost });
    }
    return true;
  };

  /** Дошли до декора по маршруту: он мог уже исчезнуть — сосед успел раньше. */
  const arrive = (q: number, r: number) => {
    const hand = handAt.current === `${q},${r}`;
    handAt.current = null;
    const map = qc.getQueryData(["beta-raid-map"]) as MapLike;
    const id = map ? readCellDetails(map, q, r).decorationId : null;
    if (!id || !list.data?.[id]) {
      toast(t("braid.target_gone"));
      return;
    }
    // «Срубить руками» подтверждён издалека — руками, даже если топор есть; на
    // клетке уже другое, что руками не рубят, — окно, а не молча инструментом.
    const conf = list.data[id];
    if (hand) return conf.hand ? act(q, r, id, true) : offer(q, r, id);
    // «Срубить · N шагов» подтверждён: инструмент в руках — рубка сразу.
    if (hasTool(conf) && stateOf(conf) === "ok") return act(q, r, id);
    offer(q, r, id);
  };

  /** Издалека — дойти и срубить: хватает энергии — сразу в путь, иначе плашка. */
  const walkChop = (c: Offer, hand: boolean) => {
    setChop(null);
    const cost = list.data?.[c.decorId]?.cost ?? 0;
    const extraCost = hand ? handChopEnergy(cost) : cost; // руками — дорога + цена руками
    handAt.current = hand ? `${c.q},${c.r}` : null;
    const go = canWalkAndAct(c.path, opts.energy, scaleEnergy(extraCost, mult), opts.tolls);
    const failed = () => void (handAt.current = null);
    walkToDecor({ approachCell: opts.approachCell, go, arrive, failed }, c.q, c.r, extraCost);
  };
  /** «Срубить руками»: рядом — сразу; издалека — дойти и рубить руками. */
  const chopByHand = (c: Offer) => (c.far ? walkChop(c, true) : act(c.q, c.r, c.decorId, true));

  const conf = chop ? list.data?.[chop.decorId] : undefined;
  const choice = conf && hasTool(conf) ? choiceOf(conf) : null;
  const used = choice?.tool ?? null;
  const walk = chop?.path ? walkEnergy(chop.path, opts.tolls) : null; // дорога, ⚡
  const chopProps: DecorChopProps | null =
    chop && conf && choice
      ? {
          conf,
          tool: choice.state,
          used,
          toolDurability:
            tool.stacks.find((s) => s.stackKey === used?.key && s.count >= 1)?.durability ?? null,
          busy: run.isPending || tool.busy,
          // Издалека (инструмент появился, пока окно было открыто) — сперва дойти.
          onChop: () => (chop.far ? walkChop(chop, false) : act(chop.q, chop.r, chop.decorId)),
          onTake: () => {
            if (used) tool.take(used.key);
          },
          onClose: () => setChop(null),
          energyMult: mult,
          walk,
          hand: conf.hand
            ? createElement(DecorHandChop, {
                busy: run.isPending,
                cost: scaleEnergy(handChopEnergy(conf.cost), mult),
                walk,
                onChop: () => chopByHand(chop),
              })
            : null,
        }
      : null;

  // Окно отдаём готовым элементом: BetaRaidScreen за лимитом строк, там — одна строка.
  const chopDialog = chopProps ? createElement(DecorChopDialog, chopProps) : null;
  return { tap, arrive, chopDialog };
}
