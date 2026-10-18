// Настройка грядки ЭТОЙ клетки: что растёт, сколько за час и кого пускают.
//
// Поле — не шахта: цены захвата тут нет вовсе (захвата нет), зато есть отбор
// работников. Редкость — набором галочек (можно несколько), уровень — ОДНИМ
// полем: пусто значит «любой», «10» читается по переключателю от/до, «1-10» —
// диапазон.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Sprout } from "lucide-react";
import { thumb } from "@/lib/image";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";
import {
  levelInputText,
  parseLevelInput,
  type FieldConfig,
  type FieldRarity,
} from "@/lib/fieldConfig";
import { MARKET_RESOURCE_GOODS, RESOURCE_LABELS_RU } from "@/lib/marketItem";
import { withoutUsdt } from "@/lib/usdtBanned"; // USDT грядка не растит, §8.49а

const RARITIES: Array<{ key: FieldRarity; label: string }> = [
  { key: "rare", label: "Рар" },
  { key: "epic", label: "Эпик" },
  { key: "legendary", label: "Лег" },
];

export function FieldConfigEditor({
  config,
  tokens,
  onChange,
}: {
  config: FieldConfig;
  /** Символы токенов — если наградой выбран токен. */
  tokens: string[];
  onChange: (next: FieldConfig) => void;
}) {
  const patch = (p: Partial<FieldConfig>) => onChange({ ...config, ...p });
  const itemsQ = useQuery({ queryKey: ["custom-items"], queryFn: () => listCustomItems() });
  // Куда считать одиночное число — «от» или «до». Диапазон переключателя не
  // касается: там обе границы заданы явно.
  const [dir, setDir] = useState<"from" | "to">(config.levelMode === "to" ? "to" : "from");
  const items = itemsQ.data ?? [];
  const reward = config.reward;
  const isItem = reward.kind === "item";

  return (
    <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
      <p className="mb-2 flex items-center justify-center gap-1 text-center text-[11px] text-emerald-300">
        <Sprout className="h-3 w-3" />
        Грядка · применится после «Сохранить» карты
      </p>

      <label className="mb-2 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Что растёт
        </span>
        <select
          value={isItem ? "item" : reward.resource}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "item") {
              patch({ reward: { kind: "item", itemId: "", name: "Товар", image: null } });
              return;
            }
            patch({
              reward: {
                kind: "resource",
                resource: v as (typeof MARKET_RESOURCE_GOODS)[number],
                token: v === "token" ? (withoutUsdt(tokens)[0] ?? null) : null,
              },
            });
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {MARKET_RESOURCE_GOODS.map((r) => (
            <option key={r} value={r}>
              {RESOURCE_LABELS_RU[r]}
            </option>
          ))}
          <option value="item">Свой товар (в рюкзак)</option>
        </select>
      </label>

      {isItem && (
        <div className="mb-2">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Какой товар
          </span>
          {/* С картинками: у своих товаров названия похожи («… зелье»), и по
              одному тексту админ их не различает. */}
          <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto">
            {items.length === 0 && (
              <p className="col-span-2 text-[11px] text-muted-foreground">
                Своих товаров пока нет — заведи их в маркете
              </p>
            )}
            {items.map((it) => {
              const on = reward.kind === "item" && reward.itemId === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() =>
                    patch({
                      reward: { kind: "item", itemId: it.id, name: it.name, image: it.image },
                    })
                  }
                  className={
                    "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition " +
                    (on
                      ? "border-gold/60 bg-gold/10 text-gold"
                      : "border-border bg-background text-muted-foreground")
                  }
                >
                  {it.image ? (
                    <img
                      src={thumb(it.image, 64)}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-md border border-border object-contain"
                    />
                  ) : (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border">
                      <ImageOff className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="truncate">{it.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isItem && reward.resource === "token" && (
        <label className="mb-2 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Символ токена
          </span>
          <input
            value={reward.token ?? ""}
            onChange={(e) => patch({ reward: { ...reward, token: e.target.value || null } })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      )}

      <label className="mb-3 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          За час на всё поле
        </span>
        <input
          type="number"
          min={1}
          value={config.yield || ""}
          placeholder="сколько"
          onChange={(e) => patch({ yield: Math.max(0, Number(e.target.value) || 0) })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-[10px] text-muted-foreground">
          Делится между всеми, кто батрачит: двое — по половине каждому.
        </span>
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Макс. героев
        </span>
        <input
          type="number"
          min={0}
          value={config.maxHeroes || ""}
          placeholder="без лимита"
          onChange={(e) =>
            patch({ maxHeroes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
          }
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-[10px] text-muted-foreground">
          Сколько героев может работать разом. Пусто или 0 — без ограничения.
        </span>
      </label>

      <div className="mb-2">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Редкость героя
        </span>
        <div className="flex flex-wrap gap-1.5">
          {RARITIES.map(({ key, label }) => {
            const on = config.rarities.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  patch({
                    rarities: on
                      ? config.rarities.filter((x) => x !== key)
                      : [...config.rarities, key],
                  })
                }
                className={
                  "rounded-full border px-3 py-1.5 text-xs transition " +
                  (on
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-border bg-background text-muted-foreground")
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="mt-1 block text-[10px] text-muted-foreground">
          Ничего не выбрано — пускаем любых.
        </span>
      </div>

      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Уровень героя
        </span>
        {/* ОДНО поле и переключатель: пусто — любой уровень, «10» — граница по
            переключателю, «1-10» — диапазон (переключатель тогда не важен). */}
        <div className="flex items-center gap-2">
          <input
            value={levelInputText(config)}
            placeholder="любой"
            inputMode="numeric"
            onChange={(e) => patch(parseLevelInput(e.target.value, dir))}
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex overflow-hidden rounded-full border border-border">
            {(["from", "to"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDir(d);
                  patch(parseLevelInput(levelInputText(config), d));
                }}
                className={
                  "px-3 py-1.5 text-xs transition " +
                  (dir === d ? "bg-gold/15 text-gold" : "bg-background text-muted-foreground")
                }
              >
                {d === "from" ? "от" : "до"}
              </button>
            ))}
          </div>
        </div>
        <span className="mt-1 block text-[10px] text-muted-foreground">
          Пусто — любой уровень. «10» с «от» — от 10-го, с «до» — до 10-го. «1-10» — диапазон.
        </span>
      </div>
    </div>
  );
}
