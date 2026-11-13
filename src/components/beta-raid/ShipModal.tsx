// Окно корабля: занять свободный или сойти со своего.
//
// Три состояния — свободен, занят другим, твой — показываются той же картинкой,
// что и на карте: игрок видит в окне ровно то судно, по которому тапнул.
// Подбитый синим динамитом (dynamite-08) — без действий, только срок до уборки.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Anchor, Loader2, LogOut, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { serverErrorText } from "@/lib/serverErrorText";
import { useT } from "@/lib/i18n";
import { formatEnergyCost, stepEnergyCost } from "@/lib/shipRules";
import { getShipAshore } from "@/server/api/beta-raid/ship-action";
import { shipImageSrc, shipLook, type ShipMark } from "./drawShips";
import { ShipHpBar, ShipRepair } from "./ShipRepair";
import { ShipPicker } from "./ShipPicker";
import { usePickedShip } from "./useShipsAtCell";
import { useShipBoard } from "./useShipBoard";
import { ShipAshoreButton } from "./ShipAshoreButton";
import { useBlastedLeft } from "./useBlastedLeft";
import { useMoveMult } from "@/components/beta-raid/useMoveMult";

/**
 * Цена хода на кнопке. Печатает её общий форматтер из shipRules — тот же, что
 * рисует кружок на клетке и метку маршрута, чтобы одно и то же число не
 * выглядело в двух местах по-разному (энергия бывает дробной).
 */
function CostBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 opacity-80">
      <Zap className="h-3.5 w-3.5" />
      {formatEnergyCost(n)}
    </span>
  );
}

export function ShipModal({
  q,
  r,
  ship,
  aboard,
  underfoot,
  slowExtra = 0,
  stepDiscount = 0,
  onClose,
}: {
  q: number;
  r: number;
  ship: ShipMark;
  /**
   * Игрок стоит на ЭТОМ судне — так сказал сервер (список причалов + своя
   * клетка). Только тогда окно предлагает сойти на берег.
   */
  aboard: boolean;
  /**
   * Судно стоит под ногами, а на борту мы не числимся (после рассинхрона или
   * портала). Возврат на борт в этом случае бесплатен — сервер тоже не берёт.
   */
  underfoot?: boolean;
  /** Надбавка замедления — она входит и в посадку, ровно как на карте. */
  slowExtra?: number;
  /**
   * Скидка героя за скорость, в ПРОЦЕНТАХ: удешевляет только сход на берег,
   * не посадку.
   */
  stepDiscount?: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();
  // «Твой корабль» — только тот, на котором ты стоишь. Признак `mine` в списке
  // причалов общий на аккаунт: судно, занятое сестринским кошельком, тоже
  // помечено «моё», но сойти с него нельзя — на борту не ты, и сервер ответит
  // «Ты не на корабле». Для соседнего судна признак снимаем: пусть окно
  // покажет его тем, что оно есть, — свободным или занятым.
  const mark = aboard ? ship : { ...ship, mine: false };
  const state = shipLook(mark);
  // Подбитый: «исчезнет через N мин» — вместо подсказки и всех кнопок.
  const blastedLeft = useBlastedLeft(state === "blasted" ? mark.blastedAt : null);
  // Куда сойдём с борта и почём. Клетку схода выбирает сервер (ships.landAround)
  // — второго источника истины не заводим, иначе подпись и списание опять
  // разъедутся. Спрашиваем только со своего борта: в общий опрос причалов этот
  // расчёт не тащим, там он гонялся бы на каждый шаг по воде.
  const ashoreQ = useQuery({
    queryKey: ["beta-raid-ashore", q, r],
    queryFn: () => getShipAshore(),
    enabled: state === "mine",
    staleTime: 10_000,
  });
  const ashore = ashoreQ.data ?? null;
  // Ровно та цена, которую спишет сервер: та же формула, та же надбавка.
  // Раньше кнопка считала голую константу, и под замедлением посадка через
  // окно выходила дешевле, чем шаг на ту же клетку по карте.
  // На борт скидку героя не даём сознательно: там забирается судно, а не ноги,
  // и сервер (ship-action.stepTo) при посадке её тоже игнорирует.
  // На острове посадка и сход в 10 раз дешевле, погода: посадка × «ход корабля», сход —
  // × «ход героя» — тот же множитель, что у сервера (move-weather).
  const mult = useMoveMult();
  const boardCost = underfoot ? 0 : stepEnergyCost({ boarding: true, slowExtra, mult });
  // Сход стоит по клетке берега — той самой, на которую сервер и высадит, и
  // это уже шаг ногами: скидка режет клетку вместе с замедлением (как сервер).
  const leaveCost = ashore
    ? stepEnergyCost({ cellCost: ashore.cost, slowExtra, heroStepDiscountPct: stepDiscount, mult })
    : null;
  /**
   * В каком состоянии цена схода. Она приезжает отдельным ленивым запросом, и
   * пока он был в пути, кнопка нажималась: игрок платил сумму, которой ему не
   * показали, а внешне «ещё грузится» ничем не отличалось от «берега рядом
   * нет». Теперь состояния разные: ждём — крутится, не доехало — предлагаем
   * повторить, берега нет — так и написано. Платить без числа нельзя.
   */
  const priceState: "ready" | "loading" | "failed" | "none" =
    state !== "mine" || leaveCost !== null
      ? "ready"
      : ashoreQ.isPending || ashoreQ.isFetching
        ? "loading"
        : ashoreQ.isError
          ? "failed"
          : "none";

  const { fleet, picked, setPickedId } = usePickedShip(q, r);
  const { board, leave } = useShipBoard({ q, r, shipId: picked?.id ?? null, onClose });

  const busy = board.isPending || leave.isPending;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[88vh] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("braid.ship")}
            </div>
            <h3 className="truncate font-display text-lg font-bold">
              {state === "mine"
                ? t("braid.ship_mine_title")
                : state === "other"
                  ? t("braid.ship_other_title")
                  : state === "dead"
                    ? t("braid.ship_dead_title")
                    : state === "blasted"
                      ? t("braid.ship_blasted_title")
                      : t("braid.ship_free")}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <img src={shipImageSrc(mark)} alt="" className="mx-auto h-28 w-28 object-contain" />
          <p className="text-center text-sm text-muted-foreground">
            {state === "mine"
              ? t("braid.ship_mine_hint")
              : state === "other"
                ? t("braid.ship_other_hint")
                : state === "dead"
                  ? t("braid.ship_dead_hint")
                  : state === "blasted"
                    ? blastedLeft
                    : t("braid.ship_free_hint")}
          </p>

          {/* Запас хода видимого борта: то же число, что подписано под кораблём
              на карте. Показываем и у разбитого — там это честный ноль. */}
          {state !== "blasted" && mark.hpMax > 0 && <ShipHpBar hp={mark.hp} hpMax={mark.hpMax} />}

          {/* Починка живёт здесь же, в окне корабля: чинить можно и свой борт
              под ногами, и разбитый у причала. Блок сам исчезает, когда чинить
              нечего — сервер отвечает пустотой на целые суда. */}
          <ShipPicker ships={fleet} selected={picked?.id ?? null} onSelect={setPickedId} />

          <ShipRepair q={q} r={r} shipId={picked?.id ?? null} />

          {state === "mine" ? (
            <ShipAshoreButton
              cost={leaveCost}
              state={priceState}
              pending={leave.isPending}
              disabled={busy}
              onLeave={() => leave.mutate()}
              onRetry={() => void ashoreQ.refetch()}
            />
          ) : state === "dead" || state === "blasted" ? null : ( // на разбитый борт садиться нечем
            <button
              type="button"
              onClick={() => board.mutate()}
              disabled={busy || state === "other"}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
            >
              {board.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Anchor className="h-4 w-4" />
              )}
              {t("braid.ship_board")}
              {/* Цену показываем до нажатия: раньше игрок узнавал её из тоста,
                  когда энергия уже списана. Число — из общей с сервером
                  формулы, иначе подпись и списание разъедутся. */}
              <CostBadge n={boardCost} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
