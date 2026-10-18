import { useAppStore } from "@/lib/store";
import { verifyViewedHero } from "./activeHeroGuard";
// Данные и действия замка в одном месте: обе вкладки читают один и тот же
// набор запросов, поэтому держать их в компонентах значило бы два раза
// дёргать сервер и два раза расходиться в том, что уже сохранено.
//
// Отряда здесь больше нет (владелец, 27.08): состав снова собирают в окне боя
// с боссом. Вместе с вкладкой ушли запрос my-hero-squad, инвентарь фишек и
// вся возня с «семенем» состава — она существовала только ради того, чтобы
// сохранение не переписало новому герою отряд предыдущего.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { listMyHeroes } from "@/server/api/heroes-read";
import { getMySelectedHero, selectMyHero } from "@/server/api/heroes-select";
import {
  equipArtifact,
  getMyHeroGear,
  getOwnedHeroGear,
  unequipArtifact,
} from "@/server/api/heroes-gear";
import { getMyBackpack, getOwnedHeroBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { invalidateHeroQueries } from "@/lib/query";
import { heroPickSettled } from "@/components/beta-raid/heroPickFrame";

/**
 * Что перечитывать после любой правки снаряжения.
 *
 * Правило владельца «без F5»: изменил — увидел сразу. Одного my-hero-gear мало.
 *   • my-heroes / my-selected-hero — карточка героя и его статы в списке;
 *   • my-game-items — инвентарь предметов: надетое из него уходит;
 *   • beta-raid-state — карта: от снаряжения зависят цена шага и обзор.
 * beta-raid-state перечитываем с refetchType "all": он лежит в суточном
 * localStorage-кэше, и без этого неактивный экран рейда показал бы старую
 * скидку шага до следующего маунта.
 */

export function useCastle({
  viewedHeroId,
  readOnly = false,
  allowActiveGear = false,
}: {
  viewedHeroId?: string;
  readOnly?: boolean;
  /** Таверна замка: открытый герой — он же активный → снаряжение можно менять. */
  allowActiveGear?: boolean;
} = {}) {
  const locked = readOnly || !!viewedHeroId;
  const ru = useLang() === "ru";
  const wallet = useAppStore((s) => s.walletAddress);
  const guard = () => {
    if (locked) throw new Error("Read only / Только просмотр");
  };
  const qc = useQueryClient();
  const t = useT();

  const heroes = useQuery({
    queryKey: viewedHeroId ? ["my-heroes", "view", wallet] : ["my-heroes"],
    queryFn: () => listMyHeroes(),
    // Просмотр: тот же ключ и срок свежести, что у списка в таверне (TavernWindow).
    ...(viewedHeroId ? { staleTime: 30_000, gcTime: 0 } : {}),
  });
  const selected = useQuery({
    queryKey: ["my-selected-hero"],
    queryFn: () => getMySelectedHero(),
    enabled: !viewedHeroId || allowActiveGear,
  });
  // Снаряжение открытого в таверне героя меняем, только если он и есть
  // активный: сервер надевает на активного, а не на того, кого смотрят.
  const gearReadOnly =
    locked &&
    !(
      allowActiveGear &&
      viewedHeroId &&
      selected.isSuccess &&
      selected.data?.heroId === viewedHeroId
    );
  const guardGear = async () => {
    if (!viewedHeroId) {
      guard();
      return;
    }
    if (!allowActiveGear)
      throw new Error(
        ru
          ? "Менять экипировку можно только у активного героя"
          : "Only the active hero’s equipment can be changed",
      );
    await verifyViewedHero(viewedHeroId, () => selected.refetch(), ru);
  };
  const gear = useQuery({
    queryKey: viewedHeroId ? ["my-hero-gear", "view", wallet, viewedHeroId] : ["my-hero-gear"],
    queryFn: () =>
      viewedHeroId ? getOwnedHeroGear({ data: { heroId: viewedHeroId } }) : getMyHeroGear(),
    // Просмотр: тот же ключ и срок свежести, что у списка в таверне (TavernWindow).
    ...(viewedHeroId ? { staleTime: 30_000, gcTime: 0 } : {}),
  });
  // Рюкзак выбранного героя — под тем же геройским ключом: refresh() ниже уже
  // его перечитывает (my-hero-backpack входит в HERO_QUERY_KEYS), ёмкость
  // зависит от редкости и торговли героя.
  const backpack = useQuery({
    queryKey: viewedHeroId
      ? ["my-hero-backpack", "view", wallet, viewedHeroId]
      : ["my-hero-backpack"],
    queryFn: () =>
      viewedHeroId ? getOwnedHeroBackpack({ data: { heroId: viewedHeroId } }) : getMyBackpack(),
    // Просмотр: тот же ключ и срок свежести, что у списка в таверне (TavernWindow).
    ...(viewedHeroId ? { staleTime: 30_000, gcTime: 0 } : {}),
  });

  // Просмотр чужого героя остаётся без действий. Для активного героя из
  // Таверны разрешаем только применение бустов, не выброс и не перенос вещей.
  const backpackUseAllowed = !locked || !!(
    viewedHeroId && allowActiveGear && selected.isSuccess && !selected.isFetching &&
    selected.data?.heroId === viewedHeroId && backpack.isSuccess &&
    backpack.data?.heroId === viewedHeroId
  );
  const beforeUseBackpack = async () => {
    if (!viewedHeroId) { guard(); return; }
    if (!allowActiveGear || !backpack.isSuccess || backpack.data?.heroId !== viewedHeroId)
      throw new Error(ru ? "Рюкзак этого героя сейчас недоступен. Открой его снова." : "This hero's backpack is unavailable. Reopen it.");
    await verifyViewedHero(viewedHeroId, () => selected.refetch(), ru);
  };

  // Один список на все геройские экраны — иначе он расходится по копиям и
  // «улучшил, а не отобразилось» возвращается (правило «без F5» в CLAUDE.md).
  const refresh = () => invalidateHeroQueries(qc, ["my-energy", "my-like-balance"]);
  const fail = (e: Error) => toast.error(humanError(e));

  // Спящий герой (лежит в инвентаре, экземпляра ещё нет) приходит без id —
  // его выбирают по шаблону, а запись сервер заводит на лету.
  const pickHero = useMutation({
    mutationFn: (h: { id: string | null; templateId: string; itemId?: string | null }) => {
      guard();
      return selectMyHero({
        data: {
          heroId: h.id,
          // Спящего будят по КОПИИ предмета: шаблон шлём только запасным
          // путём — по нему сервер сам выберет свободную копию.
          itemId: h.id ? undefined : (h.itemId ?? undefined),
          templateId: h.id ? undefined : h.templateId,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("braid.main_hero_set"));
      // Снаряжение живёт на герое — со сменой героя меняется и оно.
      refresh();
      // Кнопка крутится, пока не придут новые список и основной: рамка во
      // вкладке «Герой» не должна прыгнуть обратно на прежнего.
      return heroPickSettled(qc);
    },
    onError: fail,
  });

  // Ключ места шлём вместе с предметом: у эпика и легендаря мест одного типа
  // несколько («Карманы», «Карманы#2»), и по одному шаблону предмета сервер
  // уже не угадает, в какое из них игрок ткнул.
  const equip = useMutation({
    mutationFn: async (v: { itemId: string; slotKey: string }) => {
      await guardGear();
      return equipArtifact({ data: v });
    },
    onSuccess: () => {
      toast.success(t("braid.gear_equipped"));
      refresh();
    },
    onError: fail,
  });

  const unequip = useMutation({
    mutationFn: async (slotKey: string) => {
      await guardGear();
      return unequipArtifact({ data: { slotKey } });
    },
    onSuccess: () => {
      toast.success(t("braid.gear_unequipped"));
      refresh();
    },
    onError: fail,
  });

  const mut = { pickHero, equip, unequip };
  return {
    heroes,
    selected,
    gear,
    backpack,
    mut,
    viewedHeroId,
    readOnly: locked,
    gearReadOnly,
    guardGear,
    backpackUseAllowed,
    beforeUseBackpack,
  };
}

export type Castle = ReturnType<typeof useCastle>;
