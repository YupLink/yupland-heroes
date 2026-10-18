// Товары ратуши в пульте — по категориям, с заголовком группы (владелец,
// 04.10.2026: «сейчас бардак, всё вместе»). Добавление — «Добавить товары»:
// окно с галками, товары встают с ценой и расходом по умолчанию.
import { useState } from "react";
import { Plus } from "lucide-react";
import { categoryIdOf, groupByCategory } from "@/lib/itemCategories";
import type { TownGood } from "@/lib/townConfig";
import type { TownRules } from "@/lib/townRules";
import { TownGoodRow } from "./TownGoodRow";
import { TownGoodsPicker } from "./TownGoodsPicker";
import { townRefKey, useTownRefs } from "./useTownRefs";

export function TownGoodsList({
  goods,
  residents,
  rules,
  stock,
  lowSince,
  area,
  onChange,
  onDelete,
  onAdd,
}: {
  goods: TownGood[];
  residents: number;
  rules: TownRules;
  stock: Record<string, number> | undefined;
  /** С какого момента запас на НЗ и ниже — для отметки особого спроса. */
  lowSince?: Record<string, string | null>;
  /** Добыча с окрестности в сутки по товарам; нет — ответ сервера ещё едет. */
  area?: Record<string, number>;
  onChange: (id: string, patch: Partial<TownGood>) => void;
  onDelete: (id: string) => void;
  onAdd: (goods: TownGood[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const cat = useTownRefs(goods.length > 0 || picking);
  const metaOf = (g: TownGood) => cat.byKey.get(townRefKey(g.kind, g.refId));
  const groups = groupByCategory(
    goods,
    (g) => categoryIdOf(g.kind, metaOf(g)?.categoryId),
    cat.cats,
  );
  return (
    <div className="space-y-3">
      {groups.map(({ cat: c, items }) => (
        <section key={c.id} className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {c.name} · {items.length}
          </div>
          {items.map((g) => (
            <TownGoodRow
              key={g.id}
              good={g}
              meta={metaOf(g)}
              residents={residents}
              rules={rules}
              stock={stock?.[g.id]}
              lowSince={lowSince?.[g.id] ?? null}
              area={area?.[g.id]}
              onChange={(patch) => onChange(g.id, patch)}
              onDelete={() => onDelete(g.id)}
            />
          ))}
        </section>
      ))}
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gold/50 py-2 text-xs font-semibold text-gold"
      >
        <Plus className="h-3.5 w-3.5" /> Добавить товары
      </button>
      {picking && (
        <TownGoodsPicker
          residents={residents}
          existing={goods}
          onAdd={onAdd}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
