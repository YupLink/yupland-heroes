// Админ-форма для chip-дропа: «дроп для NFT-фишек коллекции от N⭐».
// Серверный endpoint adminCreateChipDrop + adminListChipCollectionsForDrops.
//
// Логика:
//   1. Выбор коллекции (превью + список templates #N).
//   2. Выбор минимальной звёздочки (3 / 3.5 / 4 / 4.5 / 5).
//   3. Reward (FT min-max + token), free/ticket-cost.
//   4. Создание → дроп уезжает в pg.campaigns с chip_collection_id + chip_min_level.
//      В выдаче для юзеров скрыт (admin-only).

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, Star, Plus } from "lucide-react";
import {
  adminCreateChipDrop,
  adminListChipCollectionsForDrops,
} from "@/server/api/admin-chips";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { isUsdt } from "@/lib/usdtBanned";
import { ChipImage } from "@/components/ChipImage";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { TICKET_SPEND_GOLD } from "@/lib/ticketGold";

const STAR_OPTIONS: Array<{ value: 3 | 3.5 | 4 | 4.5 | 5; label: string }> = [
  { value: 3, label: "от 3⭐" },
  { value: 3.5, label: "от 3.5⭐" },
  { value: 4, label: "от 4⭐" },
  { value: 4.5, label: "от 4.5⭐" },
  { value: 5, label: "только 5⭐" },
];

export function ChipDropPanel() {
  const qc = useQueryClient();

  const cols = useQuery({
    queryKey: ["admin", "chip-collections-for-drops"],
    queryFn: () => adminListChipCollectionsForDrops(),
  });
  const tokens = useQuery({
    queryKey: ["admin", "reward-tokens"],
    queryFn: () => listRewardTokens(),
    select: (rows) => rows.filter((t) => !isUsdt(t.symbol)), // USDT дроп не раздаёт, §8.49а
  });

  const [colId, setColId] = useState<string>("");
  const [minLevel, setMinLevel] = useState<3 | 3.5 | 4 | 4.5 | 5>(3);
  const [name, setName] = useState<string>("");
  const [nameAuto, setNameAuto] = useState<boolean>(true);
  // Единое поле награды как в обычных дропах: «1-10» или «10» (fix).
  const [reward, setReward] = useState<string>("1-10");
  const [token, setToken] = useState<string>("GDarai");
  const [freeClaim, setFreeClaim] = useState<boolean>(true);
  // Минимум 1 — пустая строка / 0 запрещены (юзер просил).
  const [ticketCost, setTicketCost] = useState<string>(String(TICKET_SPEND_GOLD));
  // Количество паков (сколько клеймов доступно)
  const [quantity, setQuantity] = useState<string>("");

  // Парсер «1-10» или «10» в {min, max}
  const rewardParsed = useMemo(() => {
    const s = reward.trim();
    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
        return { min, max };
      }
      return null;
    }
    const fixed = s.match(/^(\d+)$/);
    if (fixed) {
      const n = Number(fixed[1]);
      if (Number.isFinite(n) && n >= 0) return { min: n, max: n };
    }
    return null;
  }, [reward]);

  const selectedCol = useMemo(
    () => cols.data?.find((c) => c.id === colId),
    [cols.data, colId]
  );

  // Автогенерация имени: «Фишки <Коллекция> от N⭐»
  const autoName = useMemo(() => {
    if (!selectedCol) return "";
    const stars = Number.isInteger(minLevel) ? `${minLevel}⭐` : `${minLevel}⭐`;
    return `Фишки ${selectedCol.name} от ${stars}`;
  }, [selectedCol, minLevel]);

  const effectiveName = nameAuto ? autoName : name;

  const create = useMutation({
    mutationFn: () =>
      adminCreateChipDrop({
        data: {
          name: effectiveName,
          chipCollectionId: colId,
          chipMinLevel: minLevel,
          rewardToken: token,
          rewardMin: rewardParsed!.min,
          rewardMax: rewardParsed!.max,
          ticketCost: freeClaim ? 0 : Math.min(10, Math.max(1, Math.round((Number(ticketCost) || 0) / TICKET_SPEND_GOLD) || 1)),
          freeClaim,
          maxTotalPool: quantity ? Number(quantity) : null,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Создан chip-дроп ${r.id}`);
      qc.invalidateQueries({ queryKey: ["admin", "drops"] });
      // Сбрасываем форму но оставляем выбранную коллекцию
      setName("");
      setNameAuto(true);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const canSubmit =
    !!colId &&
    !!selectedCol &&
    !!rewardParsed &&
    !!token &&
    !create.isPending;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-gold" />
        Дроп за NFT-фишки коллекции
      </div>
      <p className="text-xs text-muted-foreground">
        Кампания таргетится на фишки выбранной коллекции с уровнем не ниже
        указанного. На кошельке у юзера должна быть хотя бы одна NFT-фишка
        этого <code>#N {selectedCol?.name ?? "Коллекция"}</code> уровня{" "}
        {minLevel}⭐+ — она появится как готовая к клейму. Не-админам не виден.
      </p>

      {/* Выбор коллекции */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          Коллекция
        </div>
        {cols.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : !cols.data || cols.data.length === 0 ? (
          <div className="text-xs text-destructive">
            Нет коллекций — создай в /admin/chips
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {cols.data.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColId(c.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-background/40 p-2 text-left transition",
                  colId === c.id
                    ? "border-gold bg-gold/10 ring-2 ring-gold/40"
                    : "border-border hover:border-gold/40"
                )}
              >
                <div className="aspect-square h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                  {c.coverImageUrl ? (
                    <img
                      src={c.coverImageUrl}
                      alt={c.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {c.templates.length === 0
                      ? "нет templates"
                      : `${c.templates.length} ${c.templates.length === 1 ? "шт" : "шт"}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Превью templates выбранной коллекции */}
      {selectedCol && selectedCol.templates.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Состав коллекции — {selectedCol.templates.length} фишек
            (показаны как {minLevel}⭐)
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {selectedCol.templates.map((t) => (
              <div
                key={t.templateNo}
                className="flex flex-col items-center gap-1"
                title={t.name}
              >
                <div className="w-full max-w-[80px]">
                  <ChipImage
                    src={t.imageUrl}
                    level={minLevel}
                    alt={t.name}
                  />
                </div>
                <div className="text-[10px] font-medium text-muted-foreground">
                  #{t.templateNo}
                </div>
                <div className="line-clamp-2 text-center text-[10px] text-foreground">
                  {t.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Выбор min уровня */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          Минимальный уровень фишки
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STAR_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setMinLevel(s.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition",
                minLevel === s.value
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-border bg-secondary/40 text-muted-foreground hover:border-gold/40 hover:text-foreground"
              )}
            >
              <Star className="h-3 w-3" />
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          В NFT-форме у фишки только уровни 3, 3.5, 4, 4.5, 5 (1-2.5 — in-game).
        </div>
      </div>

      {/* Название */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Название дропа</span>
          <button
            type="button"
            onClick={() => {
              setNameAuto((v) => !v);
              if (!nameAuto) setName("");
            }}
            className="text-[10px] underline opacity-80 hover:opacity-100"
          >
            {nameAuto ? "поменять вручную" : "вернуть автогенерацию"}
          </button>
        </div>
        <input
          type="text"
          value={effectiveName}
          onChange={(e) => {
            setNameAuto(false);
            setName(e.target.value);
          }}
          placeholder={autoName || "Название дропа"}
          className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
        />
      </div>

      {/* Награда — единое поле как в simple/combo дропах */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Награда (фикс «10» или диапазон «1-10»)
          </div>
          <input
            type="text"
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            placeholder='"10" или "1-10"'
            className={cn(
              "w-full rounded-lg border bg-background/40 px-3 py-2 text-sm",
              rewardParsed
                ? "border-border"
                : "border-destructive/50 text-destructive"
            )}
          />
          {rewardParsed ? (
            <div className="mt-1 text-[10px] text-muted-foreground">
              →{" "}
              {rewardParsed.min === rewardParsed.max
                ? `фикс ${rewardParsed.min} ${token}`
                : `рандом ${rewardParsed.min}–${rewardParsed.max} ${token}`}
            </div>
          ) : (
            <div className="mt-1 text-[10px] text-destructive">
              Введи число или диапазон «A-B»
            </div>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Токен
          </div>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm sm:w-32"
          >
            {(tokens.data ?? []).map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={freeClaim}
            onChange={(e) => {
              setFreeClaim(e.target.checked);
              if (e.target.checked) setTicketCost(String(TICKET_SPEND_GOLD));
            }}
          />
          Бесплатный клейм (free)
        </label>
        {!freeClaim && (
          <label className="inline-flex items-center gap-2 text-xs">
            Стоимость в золоте:
            <input
              type="number"
              min={TICKET_SPEND_GOLD} max={TICKET_SPEND_GOLD * 10} // золото; в базу — /500 (§8.61)
              step={TICKET_SPEND_GOLD}
              value={ticketCost}
              onChange={(e) => setTicketCost(e.target.value)}
              className="w-20 rounded-md border border-border bg-background/40 px-2 py-1 text-xs"
            />
          </label>
        )}
      </div>

      {/* Количество паков */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          Количество паков (сколько клеймов доступно)
        </div>
        <input
          type="number"
          min={1}
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Без ограничений"
          className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
        />
        <div className="mt-1 text-[10px] text-muted-foreground">
          {quantity
            ? `Доступно ${quantity} клеймов`
            : "Без ограничений — все фишки коллекции"}
        </div>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={() => create.mutate()}
        disabled={!canSubmit}
        className="inline-flex items-center gap-2 rounded-xl gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
      >
        {create.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Создать дроп
      </button>
    </div>
  );
}
