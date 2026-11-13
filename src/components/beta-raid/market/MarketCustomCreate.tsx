// Создание нового кастомного товара (шаблона): картинка + имя → raid_custom_item.
// Живёт внутри попапа MarketRefPicker (режим «Создать»). После создания шаблон
// доступен для повторного выбора у любого маркета.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { withFishItem } from "@/lib/raid/fishChances";
import { getFishingAdmin, saveFishingAdmin } from "@/server/api/beta-raid/fishing/fishing-config";
import {
  createCustomItem,
  updateCustomItem,
  type CustomItem,
} from "@/server/api/beta-raid/market-custom";
import { MarketImageInput } from "./MarketImageInput";
import { CustomBoostFields } from "./CustomBoostFields";
import { CustomCategoryField } from "./CustomCategoryField";
import { CustomFishField } from "./CustomFishField";
import { CustomKindChecks, type CustomKinds } from "./CustomKindChecks";
import type { BoostEffect } from "@/lib/hero/boost";
import { oblivionEffectsOk } from "@/lib/hero/oblivionRule";
import { toolUsesOf, toolWearOf, usesWord } from "@/lib/raid/toolWear";

export function MarketCustomCreate({
  onCreated,
  editing,
}: {
  onCreated: (item: CustomItem) => void;
  /** Задан — режим правки существующего шаблона (иначе создаём новый). */
  editing?:
    | (Omit<
        CustomItem,
        | "description"
        | "boost"
        | "isPotion"
        | "magicChest"
        | "toolWear"
        | "isShovel"
        | "plainChest"
        | "categoryId"
        | "isRod"
        | "isMap"
        | "isBinocular"
        | "isLadder"
      > & {
        description?: string | null;
        boost?: BoostEffect[] | null;
        isPotion?: boolean;
        magicChest?: boolean;
        toolWear?: number | null;
        isShovel?: boolean;
        plainChest?: boolean;
        categoryId?: string | null;
        isRod?: boolean;
        isMap?: boolean;
        isBinocular?: boolean;
        isLadder?: boolean;
      })
    | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [image, setImage] = useState<string | null>(editing?.image ?? null);
  const [desc, setDesc] = useState(editing?.description ?? "");
  // Буст товара: включённый даёт герою прибавку при использовании. Выключенный
  // не пишется вовсе — покупателю о бустах, которых нет, не сообщают.
  const [boost, setBoost] = useState<BoostEffect[] | null>(editing?.boost ?? null);
  // Галочки вида (зелье, сундуки, лопата, удочка, карта) — не больше одной.
  const [kinds, setKinds] = useState<CustomKinds>({
    isPotion: editing?.isPotion ?? false,
    magicChest: editing?.magicChest ?? false,
    plainChest: editing?.plainChest ?? false,
    isShovel: editing?.isShovel ?? false,
    isRod: editing?.isRod ?? false,
    isMap: editing?.isMap ?? false,
    isBinocular: editing?.isBinocular ?? false,
    isLadder: editing?.isLadder ?? false,
  });
  // Износ инструмента за удар, % (28.09): пусто — ломается с первого удара.
  // Сундук и карта не изнашиваются (сундуку сервер откажет) — у них поля нет.
  const [wear, setWear] = useState(editing?.toolWear ? String(editing.toolWear) : "");
  const noWear =
    kinds.magicChest || kinds.plainChest || kinds.isMap || kinds.isBinocular || kinds.isLadder;
  const toolWear = noWear ? null : toolWearOf(wear);
  // Категория (04.10): null — «без категории»; правка шлёт её всегда.
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null);
  // «Рыба» у НЕсозданного товара: id ещё нет, поэтому галочка ждёт создания и
  // уходит в улов сразу после него.
  const [fishWanted, setFishWanted] = useState(false);
  // Добавить свежесозданный вид в улов: доли пересчитает общий нормализатор.
  const addToCatch = useMutation({
    mutationFn: async (id: string) => {
      const cfg = await getFishingAdmin();
      return saveFishingAdmin({
        data: {
          intervalMin: cfg.intervalMin,
          chancePct: cfg.chancePct,
          items: withFishItem(cfg.items, id),
        },
      });
    },
    onSuccess: (res) => qc.setQueryData(["admin-fishing"], res),
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const create = useMutation({
    mutationFn: () =>
      editing
        ? updateCustomItem({
            data: {
              id: editing.id,
              name: name.trim(),
              image,
              description: desc.trim() || null,
              boost,
              ...kinds,
              toolWear,
              categoryId,
            },
          })
        : createCustomItem({
            data: {
              name: name.trim(),
              image,
              description: desc.trim() || null,
              boost,
              ...kinds,
              toolWear,
              categoryId,
            },
          }),
    onSuccess: (item) => {
      toast.success(editing ? "Товар обновлён" : "Товар создан");
      // Справочник кэширован на минуту и живёт под этим же ключом у грядки,
      // цены маркета и сетки товаров в фонде наград. Без сброса свежий товар
      // не показывался до перезагрузки страницы («обновление = табу»).
      qc.invalidateQueries({ queryKey: ["custom-items"], refetchType: "all" });
      // Товар мог сменить категорию — счётчики в справочнике категорий тоже.
      void qc.invalidateQueries({ queryKey: ["item-categories"] });
      // Галочку «рыба», поставленную до создания, применяем теперь — id есть.
      if (!editing && fishWanted) addToCatch.mutate(item.id);
      onCreated(item);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Название</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="как увидит покупатель"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Описание</span>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder="что это за товар — покупатель увидит в «i»"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <CustomCategoryField value={categoryId} onChange={setCategoryId} />
      <MarketImageInput image={image} onImage={setImage} />
      <CustomBoostFields boost={boost} onChange={setBoost} />
      <CustomKindChecks value={kinds} onChange={setKinds} />
      <CustomFishField id={editing?.id ?? null} pending={fishWanted} onPending={setFishWanted} />
      {!noWear && (
        <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <span>Износ за удар, %</span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {toolUsesOf(wear)} {usesWord(toolUsesOf(wear))}
          </span>
          <input
            value={wear}
            onChange={(e) => setWear(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            inputMode="numeric"
            placeholder="—"
            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-sm tabular-nums"
          />
        </label>
      )}
      <button
        type="button"
        onClick={() => create.mutate()}
        // «Забвение» с неверной парой «уровень + минуты» не сохраняется (ошибка под ним).
        disabled={!name.trim() || create.isPending || !oblivionEffectsOk(boost)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        {create.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {editing ? "Сохранить товар" : "Создать товар"}
      </button>
    </div>
  );
}
