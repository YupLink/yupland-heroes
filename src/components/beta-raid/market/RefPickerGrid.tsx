// Сетка шаблонов внутри попапа MarketRefPicker: тап выделяет плитку, у СВОИХ
// товаров сверху карандаш и урна. Вынесено из пикера ради лимита ≤250 строк —
// там остался каркас попапа, здесь плитки и удаление.
//
// Покупные шаблоны (герой/пак/босс) правятся в своих админках, поэтому кнопки
// показываем только для kind='custom'. Свои товары ещё и идут группами по
// категориям (refCategoryGroups) — с заголовком над каждой.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { deleteCustomItem } from "@/server/api/beta-raid/market-custom";
import { getSession } from "@/server/api/user-auth";
import type { MarketKind } from "@/lib/marketItem";
import { RefThumb } from "./RefThumb";
import { RARITY_TINT, RARITY_SHORT } from "./artAnyIcon";
import type { Ref } from "./refPickerSources";
import type { RefGroup } from "./refCategoryGroups";
import { useLang } from "@/lib/i18n";

export function RefPickerGrid({
  kind,
  list,
  picked,
  onPick,
  onEdit,
  onDeleted,
  groups,
}: {
  kind: MarketKind;
  list: Ref[];
  /** Задано — рисуем группами с заголовками (свои товары), иначе одной сеткой list. */
  groups?: RefGroup[] | null;
  picked: Ref | null;
  onPick: (ref: Ref) => void;
  /** Открыть форму правки своего шаблона. */
  onEdit: (ref: Ref) => void;
  /** Шаблон удалён — родитель снимает выделение, если оно было на нём. */
  onDeleted: (id: string) => void;
}) {
  // Какой шаблон подтверждают на удаление (спрашиваем — уберётся из справочника).
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const lang = useLang();
  const qc = useQueryClient();
  // Править и удалять свои товары — только админу; право «справочники» —
  // только создавать (владелец 04.11.2026: «может только выставлять — менять нельзя»).
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const admin = session.data?.isAdmin === true;
  const del = useMutation({
    mutationFn: (id: string) => deleteCustomItem({ data: { id } }),
    onSuccess: (_r, id) => {
      void qc.invalidateQueries({ queryKey: ["market-ref", "custom"] });
      setConfirmDel(null);
      onDeleted(id);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const tile = (r: Ref) => {
    // Редкость видно сразу — рамкой и подписью. Раньше админ выбирал
    // артефакт по имени и каждый раз ходил проверять, легендарный он или
    // обычный: в списке десятки похожих названий.
    const tint = r.rarity ? RARITY_TINT[r.rarity] : null;
    const short = r.rarity ? RARITY_SHORT[r.rarity] : null;
    return (
      <div
        key={r.id}
        onClick={() => onPick(r)}
        style={tint ? { boxShadow: `inset 0 0 0 2px ${tint}` } : undefined}
        className={`relative flex cursor-pointer flex-col gap-1 rounded-lg border p-1.5 text-left ${
          r.id === picked?.id ? "border-gold bg-gold/10" : "border-border"
        }`}
      >
        <RefThumb image={r.image} />
        <span className="truncate text-[11px] leading-tight">{r.name}</span>
        {short && (
          <span
            className="absolute left-1 top-1 rounded-full bg-black/75 px-1.5 py-0.5 text-[9px] font-extrabold uppercase"
            style={{ color: tint ?? undefined }}
          >
            {short[lang] ?? short.ru}
          </span>
        )}
        {/* Свои шаблоны можно править и удалять — покупные (герой/пак/босс)
              редактируются в своих админках, не тут. */}
        {kind === "custom" &&
          admin &&
          (confirmDel === r.id ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-black/85"
            >
              <button
                type="button"
                onClick={() => del.mutate(r.id)}
                disabled={del.isPending}
                aria-label="Удалить"
                className="grid h-7 w-7 place-items-center rounded-full bg-destructive text-white disabled:opacity-50"
              >
                {del.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDel(null)}
                aria-label="Отмена"
                className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(r);
                }}
                aria-label="Изменить"
                className="absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-gold"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDel(r.id);
                }}
                aria-label="Удалить"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          ))}
      </div>
    );
  };

  if (!groups) return <div className="grid grid-cols-3 gap-2">{list.map(tile)}</div>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.cat.id}>
          <h5 className="mb-1.5 flex items-baseline gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
            {g.cat.name}
            <span className="font-normal tabular-nums opacity-60">{g.items.length}</span>
          </h5>
          <div className="grid grid-cols-3 gap-2">{g.items.map(tile)}</div>
        </section>
      ))}
    </div>
  );
}
