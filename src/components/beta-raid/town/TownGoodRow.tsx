// Одна строка товара в пульте ратуши: что за товар (картинка и имя) и его числа.
// Сам товар здесь не меняется: убрать — урной, добавить другой — галками
// (TownGoodsPicker). Нативных <select> нет: в вебвью Xiaomi они не срабатывали.
// «Что делает город» не выбирается: товар ратуши город и продаёт, и покупает —
// всегда (владелец, 03.10.2026).
import { Trash2 } from "lucide-react";
import { RefThumb } from "../market/RefThumb";
import type { TownGood } from "@/lib/townConfig";
import type { TownRules } from "@/lib/townRules";
import { TownGoodNumbers } from "./TownGoodNumbers";
import { TownGoodLive } from "./TownGoodLive";
import type { TownRef } from "./useTownRefs";

export function TownGoodRow({
  good,
  meta,
  residents,
  rules,
  stock,
  area,
  lowSince = null,
  onChange,
  onDelete,
}: {
  good: TownGood;
  /** Подпись и картинка из каталога; нет — шаблон удалён или ещё грузится. */
  meta: TownRef | undefined;
  residents: number;
  rules: TownRules;
  /** Склад сейчас; нет — товар новый, стартует ровно с нормы. */
  stock: number | undefined;
  /** Добыча с окрестности в сутки. */
  area?: number;
  /** С какого момента запас на НЗ и ниже (особый спрос). */
  lowSince?: string | null;
  onChange: (patch: Partial<TownGood>) => void;
  onDelete: () => void;
}) {
  const isToken = good.kind === "resource" && good.refId === "token";
  const name = meta?.name ?? (isToken ? good.token || "Токен" : (good.refId ?? "Товар"));
  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-background/40 p-2.5">
      <div className="flex items-center gap-2">
        <span className="h-9 w-9 shrink-0">
          <RefThumb image={meta?.image ?? null} size={72} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        <button
          type="button"
          onClick={onDelete}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-destructive"
          aria-label="Удалить товар"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {isToken && (
        <input
          value={good.token ?? ""}
          onChange={(e) => onChange({ token: e.target.value })}
          placeholder="символ токена (напр. Darai)"
          className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm"
        />
      )}
      <TownGoodNumbers good={good} residents={residents} onChange={onChange} />
      <TownGoodLive good={good} residents={residents} rules={rules} stock={stock} area={area} lowSince={lowSince} />
    </div>
  );
}
