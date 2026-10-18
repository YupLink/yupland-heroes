// Фонды раздела: чем платят новые объекты. Одна строка — один вид.
//
// Скарб — общий термин на всё раскидываемое: старые «валюты» (лайки, энергия,
// билеты, токен) + новые виды с ссылкой на конкретный шаблон:
//   · «Ресурс» — золото/камень/дерево/алмазы единого счёта;
//   · «Товар»  — свой товар из справочника (пшеница, молоко, зелье…).
// Раньше на карту летели только валюты, а сундук с ресурсом раздавать «массово»
// было нечем (жалоба владельца по голосовой 15.09).
//
// Вид выбирается КНОПКАМИ, а не нативным <select>: в Telegram-вебвью Xiaomi
// нативный дропдаун не коммитит выбор.
import { useQuery } from "@tanstack/react-query";
import { Boxes, Coins, Heart, Package, Plus, Ticket, Trash2, Zap } from "lucide-react";
import { thumb } from "@/lib/image";
import { REWARD_RESOURCES } from "@/lib/rewardKinds";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";
import { Chip, FieldLabel, NumBox } from "./ScatterFields";
import type { FundDraft, FundKind } from "./scatterDraft";

const KINDS: Array<{ id: FundKind; label: string; Icon: typeof Heart }> = [
  { id: "likes", label: "Лайки", Icon: Heart },
  { id: "energy", label: "Энергия", Icon: Zap },
  { id: "tickets", label: "Билеты", Icon: Ticket },
  { id: "token", label: "Токен", Icon: Coins },
  { id: "resource", label: "Ресурс", Icon: Boxes },
  { id: "custom", label: "Товар", Icon: Package },
];

const RESOURCE_LABEL: Record<string, string> = {
  gold: "Золото",
  stone: "Камень",
  wood: "Дерево",
  diamonds: "Алмазы",
};

export function ScatterFundList({
  funds,
  onChange,
  tokens,
}: {
  funds: FundDraft[];
  onChange: (next: FundDraft[]) => void;
  /** Символы токенов наград — приходят с сервера (adminListRewardTokens). */
  tokens: string[];
}) {
  const patch = (i: number, next: Partial<FundDraft>) =>
    onChange(funds.map((f, j) => (j === i ? { ...f, ...next } : f)));

  // Ленивый селектор своих товаров: подтягиваем каталог один раз на форму,
  // чтобы клик по «Товар» не ждал сети.
  const customQ = useQuery({
    queryKey: ["scatter-custom-items"],
    queryFn: () => listCustomItems(),
  });
  const customs = customQ.data ?? [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <FieldLabel>Фонд наград</FieldLabel>
        <button
          type="button"
          onClick={() =>
            // Первый токен подставляем сразу: строка «Токен» без символа —
            // нерабочая награда, и её всё равно пришлось бы дозаполнять.
            onChange([
              ...funds,
              {
                kind: "likes",
                token: tokens[0] ?? null,
                amount: "",
                resource: null,
                itemId: null,
              },
            ])
          }
          className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-[11px] font-semibold text-gold"
        >
          <Plus className="h-3 w-3" /> Добавить
        </button>
      </div>

      {funds.length === 0 && (
        <p className="rounded-lg border border-dashed border-border/60 p-2 text-center text-[10px] text-muted-foreground">
          Фонда нет — объекты встанут пустыми
        </p>
      )}

      {funds.map((f, i) => (
        <div
          key={i}
          className="space-y-1 rounded-lg border border-border/60 bg-background/40 p-1.5"
        >
          <div className="flex flex-wrap items-center gap-1">
            {KINDS.map(({ id, label, Icon }) => (
              <Chip key={id} on={f.kind === id} onClick={() => patch(i, { kind: id })}>
                <Icon className="h-3 w-3" />
                {label}
              </Chip>
            ))}
          </div>

          {/* Токен: выбор символа монеты */}
          {f.kind === "token" && (
            <div className="flex flex-wrap items-center gap-1">
              {tokens.length === 0 ? (
                <span className="text-[10px] text-muted-foreground">токенов нет</span>
              ) : (
                tokens.map((s) => (
                  <Chip key={s} on={f.token === s} onClick={() => patch(i, { token: s })}>
                    {s}
                  </Chip>
                ))
              )}
            </div>
          )}

          {/* Ресурс единого счёта */}
          {f.kind === "resource" && (
            <div className="flex flex-wrap items-center gap-1">
              {REWARD_RESOURCES.map((code) => (
                <Chip
                  key={code}
                  on={f.resource === code}
                  onClick={() => patch(i, { resource: code })}
                >
                  {RESOURCE_LABEL[code] ?? code}
                </Chip>
              ))}
            </div>
          )}

          {/* Свой товар: сетка мини-плиток */}
          {f.kind === "custom" && (
            <>
              {customs.length === 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  своих товаров пока нет — заведи в маркете
                </span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {customs.map((c) => {
                    const on = f.itemId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => patch(i, { itemId: c.id })}
                        title={c.name}
                        className={
                          "flex w-16 flex-col items-center gap-0.5 rounded border p-1 text-[9px] " +
                          (on
                            ? "border-gold bg-gold/10 text-gold"
                            : "border-border bg-background text-muted-foreground")
                        }
                      >
                        {c.image ? (
                          <img
                            src={thumb(c.image, 48)}
                            alt=""
                            className="h-7 w-7 rounded object-contain"
                          />
                        ) : (
                          <span className="grid h-7 w-7 place-items-center rounded bg-secondary">
                            —
                          </span>
                        )}
                        <span className="w-full truncate text-center">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Сумма и корзина держатся ОДНОЙ строкой без переноса. */}
          <div className="flex items-center gap-1">
            <NumBox
              value={f.amount}
              onChange={(v) => patch(i, { amount: v })}
              placeholder="сумма"
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => onChange(funds.filter((_, j) => j !== i))}
              aria-label="Убрать фонд"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
