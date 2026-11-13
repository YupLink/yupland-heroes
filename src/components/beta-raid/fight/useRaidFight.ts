// Бой на карте — хук экрана рейда. Что и почему — в fightControl.ts.
//
// Входы в бой:
//  • тап по цели рядом — первый выбирает её («i» и «Атаковать»), второй и дальше бьют
//    запомненным отрядом (владелец, 23.10.2026);
//  • «Атаковать» (над картой, в карточке «рядом») — удар сразу;
//  • «i» (карточка, HUD над картой, итог боя) — нынешнее окно цели, бить можно и оттуда;
//  • дошли по маршруту до дальней цели — окно цели, как и было.
// После удара итог предлагает «Атаковать снова» — без закрытия и перезахода.
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LineChip } from "@/components/game/ChipSquadPicker";
import {
  ATTACK_KEY,
  useBetaEncounter,
  type AttackResult,
} from "@/components/beta-raid/useBetaEncounter";
import { useObjectInteract } from "@/components/beta-raid/useObjectInteract";
import { useEnergyMult } from "@/components/beta-raid/useEnergyMult";
import { readRememberedLineup } from "@/components/beta-raid/useRememberedLineup";
import type { Cell } from "@/components/beta-raid/unpackMap";
import {
  createFightControl,
  fightTargetNear,
  hitCost,
  metaCost,
  refusalOpensInfo,
  sameTarget,
  type FightTarget,
} from "./fightControl";
import { publishFightInfo, setFightAttacker, setFightInfoOpener } from "./fightInfoBus";

type ObjectInfo = { meta: unknown; kind?: string | null };

/** Всё, что нужно окнам боя (BetaRaidOverlays). */
export type RaidFightUi = {
  encounter: FightTarget | null;
  result: AttackResult | null;
  fighting: boolean;
  /** Цена следующего удара — подпись на «Атаковать снова». */
  againCost: number | null;
  onAttack: (lineup: LineChip[]) => void;
  onAgain: () => void;
  onInfo: () => void;
  onCloseEncounter: () => void;
  onCloseResult: () => void;
};

export function useRaidFight(o: {
  energy: number;
  cells: Record<string, Cell>;
  objects: Record<string, ObjectInfo> | undefined;
  playerPos: { q: number; r: number } | null;
  /** Полный экран: карточки «рядом» под картой нет — «i» показывает HUD. */
  fullscreen?: boolean;
}) {
  const enc = useBetaEncounter();
  const qc = useQueryClient();
  const mult = useEnergyMult();
  // Контроллер создаётся один раз, а энергия, словарь и мутация меняются —
  // он читает их отсюда в момент нажатия.
  const live = useRef({ enc, energy: o.energy, objects: o.objects, mult });
  live.current = { enc, energy: o.energy, objects: o.objects, mult };

  // Выбор цели живёт в контроллере — сменился, перерисовываем «i» и «Атаковать».
  const [, rearm] = useReducer((x: number) => x + 1, 0);
  const { setEncounter, setFightResult } = enc;
  const openInfo = useCallback(
    (t: FightTarget) => {
      setFightResult(null);
      setEncounter({ objectId: t.objectId, q: t.q, r: t.r });
    },
    [setEncounter, setFightResult],
  );

  const ctl = useMemo(
    () =>
      createFightControl({
        // Счётчик кэша мутаций, а не isPending: тот обновится только к
        // следующему рендеру, и двойной тап успел бы отправить два удара.
        pending: () => qc.isMutating({ mutationKey: ATTACK_KEY }) > 0,
        energy: () => live.current.energy,
        lineup: readRememberedLineup,
        costOf: (t) => {
          // Окно цели уже спрашивало цену у сервера — она точнее шаблона
          // (своя цена клетки). Нет её — шаблон с множителем карты.
          const peek = qc.getQueryData<{ interactionCost?: number }>([
            "beta-encounter",
            t.objectId,
            t.q,
            t.r,
          ]);
          if (typeof peek?.interactionCost === "number") return peek.interactionCost;
          const obj = live.current.objects?.[t.objectId];
          return obj ? metaCost(obj.meta, live.current.mult) : null;
        },
        hit: (args, onRefused) =>
          live.current.enc.attack.mutate(args, {
            onError: (e) => {
              if (refusalOpensInfo(e.message)) onRefused();
            },
          }),
        openInfo,
        onArm: rearm,
      }),
    [qc, openInfo],
  );

  const interact = useObjectInteract({ openEncounter: ctl.tap, collect: enc.collect });
  const strike = useObjectInteract({ openEncounter: ctl.attack, collect: enc.collect });
  const arrive = useObjectInteract({ openEncounter: openInfo, collect: enc.collect });

  const fighting = enc.attack.isPending;
  // Выбор держится, пока цель рядом: герой отошёл или цель добита — выбор снят.
  const armed = ctl.armed();
  const armedNear =
    armed && sameTarget(fightTargetNear(o.cells, o.objects, o.playerPos, armed), armed) ? armed : null;
  useEffect(() => {
    if (armed && !armedNear) ctl.disarm();
  });
  // «i» и «Атаковать» над картой — только в полном экране: там карточки «рядом» не видно.
  useEffect(() => publishFightInfo(o.fullscreen ? armedNear : null, fighting));
  useEffect(() => {
    setFightInfoOpener(openInfo);
    setFightAttacker(ctl.attack);
    return () => {
      setFightInfoOpener(null);
      setFightAttacker(null);
      publishFightInfo(null, false);
    };
  }, [openInfo, ctl]);

  const result = enc.fightResult;
  const ui: RaidFightUi = {
    encounter: enc.encounter,
    result,
    fighting,
    againCost: hitCost(result),
    onAttack: (lineup) => {
      if (enc.encounter) ctl.fromWindow(enc.encounter, lineup);
    },
    onAgain: () => ctl.again(result),
    onInfo: () => {
      const last = ctl.last();
      if (last) openInfo(last);
    },
    onCloseEncounter: () => setEncounter(null),
    onCloseResult: () => setFightResult(null),
  };

  return {
    /** Тап по объекту рядом: бой — выбрать, повтор — удар; лут — забрать. */
    interact,
    /** Кнопка «В бой» в карточке «рядом»: бой — удар сразу, лут — забрать. */
    strike,
    /** Пришли по маршруту: бой — окно цели (как раньше), лут — забрать. */
    arrive,
    openInfo,
    encounter: enc.encounter,
    /** Карточка «рядом» крутит спиннер: идёт удар или забираем эту клетку. */
    busyAt: (cell: { q: number; r: number } | null) =>
      fighting || (!!cell && enc.collecting === `${cell.q},${cell.r}`),
    ui,
  };
}
