// Довыбор для новых видов награды: КАКОЙ ресурс и КАКОЙ свой товар.
//
// Оба контрола списаны с грядки (hex-editor/FieldConfigEditor): там админ уже
// привык к селекту ресурсов и к сетке товаров с миниатюрами. У своих товаров
// названия похожи («… зелье»), и по одному тексту их не различить — картинка
// не украшение, а способ не ошибиться.
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { thumb } from "@/lib/image";
import { RESOURCE_LABELS_RU } from "@/lib/marketItem";
import { REWARD_RESOURCES, rewardKindImage, type RewardResource } from "@/lib/rewardKinds";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";

/** Селект «золото/камень/дерево/алмазы» + спрайт выбранного. */
export function RewardResourceSelect({
  value,
  onChange,
}: {
  value: RewardResource | null | undefined;
  onChange: (res: RewardResource) => void;
}) {
  const src = rewardKindImage(value);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {src && <img src={src} alt="" className="h-7 w-7 shrink-0 object-contain" />}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as RewardResource)}
        className="min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 text-base outline-none focus:border-gold/50"
      >
        <option value="" disabled>
          — ресурс —
        </option>
        {REWARD_RESOURCES.map((r) => (
          <option key={r} value={r}>
            {RESOURCE_LABELS_RU[r]}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Сетка своих товаров маркета с миниатюрами; выбранный подсвечен золотом. */
export function CustomItemGrid({
  itemId,
  onPick,
}: {
  itemId: string | null | undefined;
  onPick: (id: string) => void;
}) {
  // Ключ кэша тот же, что у грядки и у цены маркета — справочник один,
  // и лишний раз за 34 записями ходить незачем.
  const q = useQuery({
    queryKey: ["custom-items"],
    queryFn: () => listCustomItems(),
    staleTime: 60_000,
  });
  const items = q.data ?? [];
  return (
    // Своя прокрутка: на 360 px сетка в две колонки, список не растит форму.
    <div className="grid max-h-44 w-full grid-cols-2 gap-1.5 overflow-y-auto">
      {q.isLoading && <p className="col-span-2 text-[11px] text-muted-foreground">Загрузка…</p>}
      {!q.isLoading && items.length === 0 && (
        <p className="col-span-2 text-[11px] text-muted-foreground">
          Своих товаров пока нет — заведи их в маркете
        </p>
      )}
      {items.map((it) => {
        const on = it.id === itemId;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onPick(it.id)}
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
                loading="lazy"
                decoding="async"
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
  );
}
