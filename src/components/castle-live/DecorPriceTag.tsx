// Цена вида декора в золоте под карточкой каталога + карандаш (ПРАВИЛА §8.64;
// владелец 22.10.2026: «карандаш у админа и ангелины — цена в золоте и только»).
// Каталог декора видят только админы и дизайнер (canDecor), им же и карандаш.
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useSetDecorPrice, useTownHall } from "./useTownHall";

export function DecorPriceTag({ kind, ru }: { kind: string; ru: boolean }) {
  const q = useTownHall();
  const save = useSetDecorPrice(ru);
  const [draft, setDraft] = useState<string | null>(null);
  if (!q.data?.pricesOpen) return null;
  const price = q.data.decor.prices[kind];
  const value = Number(draft);
  const valid = draft !== null && Number.isInteger(value) && value >= 1;
  if (draft !== null) {
    return (
      <form
        className="scene-editor-decor-price"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate({ kind, gold: value }, { onSuccess: () => setDraft(null) });
        }}
      >
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={draft}
          autoFocus
          aria-label={ru ? "Цена в золоте" : "Price in gold"}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" aria-label={ru ? "Сохранить" : "Save"} disabled={!valid || save.isPending}>
          <Check size={13} />
        </button>
        <button type="button" aria-label={ru ? "Отмена" : "Cancel"} onClick={() => setDraft(null)}>
          <X size={13} />
        </button>
      </form>
    );
  }
  return (
    <span className="scene-editor-decor-price">
      <img src="/resources/gold.webp" alt="" />
      {price ? price.toLocaleString(ru ? "ru-RU" : "en-US") : "—"}
      <button
        type="button"
        aria-label={ru ? "Изменить цену" : "Edit price"}
        onClick={() => setDraft(price ? String(price) : "")}
      >
        <Pencil size={12} />
      </button>
    </span>
  );
}
