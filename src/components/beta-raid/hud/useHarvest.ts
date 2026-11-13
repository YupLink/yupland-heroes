// Данные для кружков под мини-картой: что собрать и что подарили.
//
// Оба запроса лёгкие и нужны ВСЕГДА (цифра на кнопке), поэтому живут отдельным
// хуком с редким автообновлением: карта и так опрашивает много чего, а частый
// опрос ради бейджа — лишний трафик на телефоне.
import { useEffect, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getHarvestSummary, type HarvestSummary } from "@/server/api/beta-raid/harvest-summary";
import { getMyGifts, type MyGift } from "@/server/api/gifts";
import { isLiveGift } from "@/lib/giftExpiry";
import { nextRewardExpiry } from "@/lib/rewardExpiry";
import { mineRowReady } from "@/lib/mineLost";
import { subscribeOpenHarvest } from "./harvestOpenBus";
import { MINE_OFFICE_KEY } from "@/lib/mineOfficeBus";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { MINE_PENDINGS_KEY } from "@/lib/hooks/useMinePendings";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";

export const HARVEST_KEY = ["beta-raid-harvest"] as const;
export const GIFTS_KEY = ["my-gifts"] as const;

/**
 * Сводка + наша метка получения (середина запроса): вместе с serverNow она
 * даёт часы сервера (lib/mineV2Clock) — срок шахт не врёт на сбитом телефоне.
 * Один загрузчик на все окна с HARVEST_KEY, чтобы кэш был одного вида.
 */
export async function fetchHarvest(): Promise<HarvestSummary & { clientAt: number }> {
  const sent = Date.now();
  const res = await getHarvestSummary();
  return { ...res, clientAt: Math.round((sent + Date.now()) / 2) };
}

/**
 * После сбора с шахт («Добыча», «Управление шахтами»): сводка, плашка сбора,
 * ресурсы, энергия и счёт — и в неактивных кэшах (persist).
 */
export function refreshAfterCollect(qc: QueryClient): void {
  for (const key of [HARVEST_KEY, MINE_PENDINGS_KEY, RESOURCES_KEY, ENERGY_KEY, ACC_BALANCES_KEY]) {
    void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
  }
}

/** Сводка добычи + число «есть что забрать» для бейджа. */
export function useHarvest() {
  const q = useQuery({
    queryKey: HARVEST_KEY,
    queryFn: fetchHarvest,
    staleTime: 60_000,
    refetchInterval: 120_000,
    // Интервал в фоне не тикает, а SSE за время фона теряет события: игрок,
    // вернувшийся в приложение, видел бы отбитую шахту как свою ещё до двух
    // минут. Один запрос на возврат — как у балансов счёта.
    refetchOnWindowFocus: true,
  });
  const data = q.data;
  // На кнопке — сколько именно НАГРАД ждёт: готовые шахты плюс очередь боссов
  // и сундуков. Поля сюда не входят: урожай уходит на склад сам.
  // Отнятые шахты с несобранным (§8.71) — в том же списке, готовыми к сбору.
  const readyMines = (data?.mines ?? []).filter((m) => mineRowReady(m) > 0).length;
  // Добыча разграбленного сундука горит через сутки: сгоревшую сервер уже не
  // отдаёт — перечитываем ровно в миг сгорания, а не через опрос, чтобы
  // цифра на кружке не звала к тому, чего нет.
  const burnAt = nextRewardExpiry(data?.rewards);
  const { refetch, dataUpdatedAt } = q;
  useEffect(() => {
    if (burnAt == null) return;
    // Срок уже в прошлом, а сервер награду ещё отдаёт (часы телефона спешат) —
    // спрашиваем ещё раз через полминуты (таймер перевзводится после ответа:
    // dataUpdatedAt в зависимостях), а дальше хватит обычного опроса.
    const left = burnAt - Date.now();
    if (left < -60_000) return;
    const wait = left > 0 ? Math.min(left + 1_000, 2 ** 31 - 1) : 30_000;
    const timer = setTimeout(() => void refetch(), wait);
    return () => clearTimeout(timer);
  }, [burnAt, refetch, dataUpdatedAt]);
  // Добыча разграбленных сундуков — в той же очереди наград (rewardCount);
  // незакрытые уведомления о потерях (§8.106) — тоже цифрой на кружке.
  return { data, count: readyMines + (data?.rewardCount ?? 0) + (data?.noticeCount ?? 0) };
}

/** Окно HUD карты («Добыча» / «Подарки»); «Показать» письма открывает «Добычу». */
export function useHudPanel() {
  const [open, setOpen] = useState<null | "harvest" | "gifts">(null);
  useEffect(() => subscribeOpenHarvest(() => setOpen("harvest")), []);
  return [open, setOpen] as const;
}

/**
 * Живой канал: личное «шахту отняли» (mine-lost-notify, владелец одобрил
 * 23.10.2026). Поток отдаёт его только прежнему хозяину и без адресата; кто
 * отнял — в событии нет. «Добыча», цифра на кружке и флажки шахт — без F5.
 * Тоста нет (владелец 04.11, §8.106: «все уведомления только в окне
 * добычи»). Событие «mineLost» — true; иное — false.
 */
export function handleMineLost(qc: QueryClient, event: { type?: string }): boolean {
  if (event.type !== "mineLost") return false;
  void qc.invalidateQueries({ queryKey: HARVEST_KEY, refetchType: "all" });
  void qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
  // «Управление шахтами» (25.10.2026): отнятая из окна исчезает сразу,
  // несобранное с неё ждёт в «Добыче» строкой «отнята» (§8.71).
  void qc.invalidateQueries({ queryKey: MINE_OFFICE_KEY });
  return true;
}

/** Сгоревшие отсеиваем и на клиенте: между опросами кружок не должен звать
 *  к подарку, который сервер уже не отдаст. */
const liveOnly = (rows: MyGift[]): MyGift[] => rows.filter((g) => isLiveGift(g.expiresAt));

/** Мои неполученные подарки. Пусто — кружка подарка на карте нет вовсе. */
export function useGifts() {
  const [now, setNow] = useState(Date.now);
  const q = useQuery({
    queryKey: GIFTS_KEY,
    queryFn: () => getMyGifts(),
    select: liveOnly,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  // Один таймер до ближайшего сгорания (14.10.2026: был тик раз в секунду —
  // весь HUD карты перерисовывался каждую секунду ради редкого события).
  const burnAt = (q.data ?? []).reduce<number | null>(
    (min, g) =>
      g.expiresAt != null && g.expiresAt > now && (min == null || g.expiresAt < min)
        ? g.expiresAt
        : min,
    null,
  );
  useEffect(() => {
    if (burnAt == null) return;
    const wait = Math.min(Math.max(burnAt - Date.now() + 50, 0), 2 ** 31 - 1);
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [burnAt]);
  const available = q.isSuccess ? (q.data ?? []).filter((g) => isLiveGift(g.expiresAt, now)) : [];
  // isPending/isError/refetch — окну подарков в замке: загрузка и ошибка не
  // выдают себя за «подарков нет».
  return {
    gifts: available,
    count: available.length,
    isPending: q.isPending,
    isError: q.isError,
    refetch: q.refetch,
  };
}
