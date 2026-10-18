// Что админ ставит на клетку: местность, дорога, декор, объект, постройка.
//
// Полная палитра живёт в редакторе карт; здесь — её карманная версия, чтобы
// с телефона выдать лодку, подсыпать монетку или прокопать пролив.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { thumb } from "@/lib/image";
import { humanError } from "@/lib/humanError";
import { uploadTrimmed } from "@/lib/trimImage";
import { adminCreateItem, adminListItems } from "@/server/api/items";
import { adminListBossTemplates, adminSaveBossTemplate } from "@/server/api/raid-admin";
import { useLang } from "@/lib/i18n";
import { VOID_DOME } from "@/lib/voidDome";
import { GEN_ON, VOID_ON } from "./brushPatch";
import { godText } from "./adminCellText";

export type AssetKind =
  | "terrain"
  | "road"
  | "decoration"
  | "chest"
  | "artifact"
  | "boss"
  | "building";

/** Объекты на карте хранятся как «вид:шаблон» — сундук и артефакт различимы. */
export const OBJECT_KINDS: AssetKind[] = ["chest", "artifact", "boss"];

export type Asset = {
  id: string;
  name: string;
  imageUrl: string | null;
  active: boolean;
  /** Сколько у постройки тиров (meta.tiers); у остальных видов — 0. */
  tiers: number;
  /**
   * Цена шага по местности или дороге (stat_amount) — ровно так её считает сервер
   * (map-assets.buildAssetDicts). Нужна кисти: свежий мазок ложился в карту с
   * ценой 1, кружок обещал единицу, а сервер списывал цену старой местности.
   */
  cost: number;
};

/** Подпись вкладки — для подсказки «+ новый элемент (…)». */
const KIND_LABEL: Record<AssetKind, string> = {
  terrain: "местность",
  road: "дорога",
  decoration: "декор",
  chest: "сундук / монетка",
  artifact: "артефакт",
  boss: "босс",
  building: "постройка",
};

/** Цена шага: у сервера то же правило — ноль и пусто означают обычную единицу. */
const costOf = (raw: number | null | undefined): number => Number(raw) || 1;

/** Длина цепочки тиров постройки — по ней считается потолок «+» в окне клетки. */
function tiersOf(meta: unknown): number {
  const raw = (meta as { tiers?: unknown } | null)?.tiers;
  return Array.isArray(raw) ? raw.length : 0;
}

/**
 * Ассеты для палитры. Боссы живут не в общем справочнике, а в своей таблице —
 * поэтому их приносим отдельным запросом, иначе вкладка «Босс» пустовала.
 *
 * Этим же справочником пользуется окно клетки: у только что поставленной
 * постройки карта ещё не знает ни имени, ни числа тиров, а палитра знает.
 */
export function useAssets(kind: AssetKind, enabled = true) {
  return useQuery<Asset[]>({
    queryKey: ["admin-live-assets", kind],
    queryFn: async () => {
      if (kind === "boss") {
        // Боссы карты живут в своей таблице (raid_boss_template), а не в общем
        // справочнике ассетов — оттуда их и берём, как редактор карт.
        const { templates } = await adminListBossTemplates();
        return templates.map((b) => ({
          id: b.id,
          name: b.name,
          imageUrl: b.mapImageUrl || b.imageUrl,
          active: true,
          tiers: 0,
          cost: 1,
        }));
      }
      const items = await adminListItems({ data: { kind } });
      return items.map((i) => ({
        id: i.id,
        name: i.name,
        imageUrl: i.imageUrl,
        active: i.active,
        tiers: tiersOf(i.meta),
        cost: costOf(i.statAmount),
      }));
    },
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function AdminCellPalette({
  kind,
  selected,
  onPick,
}: {
  kind: AssetKind;
  selected: string | null;
  onPick: (id: string, name: string) => void;
}) {
  const t = godText(useLang());
  const qc = useQueryClient();
  const q = useAssets(kind);
  const items = (q.data ?? []).filter((i) => i.active);

  // «+ новый» в конце КАЖДОЙ вкладки палитры: завести новый элемент прямо в режиме
  // бога (имя + картинка). Босс живёт в своей таблице (adminSaveBossTemplate,
  // минимум — имя+HP+картинка), остальное — общий справочник (adminCreateItem);
  // постройке нужен хотя бы один тир с картинкой. Просьба владельца: «+ в конце
  // списка в каждой категории».
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const startCreate = () => {
    const name = window.prompt(`Название нового элемента (${KIND_LABEL[kind]})`)?.trim();
    if (!name) return;
    setPendingName(name);
    fileRef.current?.click();
  };

  async function onCreateFile(files: FileList | null) {
    const file = files?.[0];
    const name = pendingName;
    setPendingName(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!file || !name) return;
    setCreating(true);
    try {
      const url = await uploadTrimmed(file);
      if (kind === "boss") {
        // Босс минимально: имя, эталонные 1000 HP (правится в редакторе босса) и
        // картинка (для карты — mapImageUrl).
        await adminSaveBossTemplate({
          data: { name, maxHp: 1000, imageUrl: url, mapImageUrl: url },
        });
      } else {
        await adminCreateItem({
          data: {
            kind,
            name,
            imageUrl: url,
            // Постройке нужен хотя бы один тир с картинкой — по нему её рисует карта.
            ...(kind === "building" ? { meta: { tiers: [{ name: "Тир 1", imageUrl: url }] } } : {}),
          },
        });
      }
      toast.success(`Добавлено: «${name}»`);
      await qc.invalidateQueries({ queryKey: ["admin-live-assets", kind] });
    } catch (e) {
      toast.error(humanError(e as Error));
    } finally {
      setCreating(false);
    }
  }

  if (q.isLoading) {
    return <p className="py-2 text-center text-[11px] text-muted-foreground">{t.loadingAssets}</p>;
  }
  // Пусто не отсекаем ранним выходом: «+ новый» должен быть доступен и в пустой
  // категории — иначе в неё нечем добавить первый элемент.

  return (
    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
      {/* Купол живёт во вкладке «Местность»: он ОТНОСИТСЯ к местности, но ею
          не является — terrainId не трогает, только свой флаг. Стоит первым,
          чтобы не искать его в хвосте длинного списка. Кнопка ОДНА — тумблер
          по первой клетке мазка. */}
      {kind === "terrain" && (
        <>
          <VoidBrushButton
            id={VOID_ON}
            label={t.voidBrushOn}
            selected={selected === VOID_ON}
            onPick={onPick}
          />
          {/* Кисть «выделение под биом-генератор» — рядом с куполом по той же
              причине: искать её в другой вкладке нелогично. */}
          <BiomeGenBrushButton
            id={GEN_ON}
            label={t.biomeBrushOn}
            selected={selected === GEN_ON}
            onPick={onPick}
          />
        </>
      )}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id, item.name)}
          className={`flex w-[4.5rem] flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] ${
            selected === item.id ? "border-gold bg-gold/10" : "border-border bg-secondary/30"
          }`}
        >
          {item.imageUrl ? (
            <img src={thumb(item.imageUrl, 64)} alt="" className="h-8 w-8 rounded object-contain" />
          ) : (
            <span className="grid h-8 w-8 place-items-center text-muted-foreground">—</span>
          )}
          <span className="w-full truncate text-center">{item.name}</span>
        </button>
      ))}
      {/* Последняя ячейка КАЖДОЙ вкладки — «+ новый»: имя + картинка.
          Кроме построек: облики создаются только через скинпикер в окне
          клетки. Иначе загруженный тут вид «древо х» падает в общий
          шаблонник и торчит рядом с Плавильней и Ломбардом (жалоба
          владельца «скины делали, чтобы разгрузить общее поле»). */}
      {kind !== "building" && (
        <button
          type="button"
          onClick={startCreate}
          disabled={creating}
          title="Новый элемент: имя + картинка"
          className="flex w-[4.5rem] flex-col items-center gap-1 rounded-xl border border-dashed border-gold/60 p-1.5 text-[10px] text-gold disabled:opacity-40"
        >
          <span className="grid h-8 w-8 place-items-center">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
          </span>
          <span className="w-full truncate text-center">новый</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onCreateFile(e.target.files)}
      />
    </div>
  );
}

/** Кнопка кисти купола. Картинки у него нет: узнаётся по штриховке зоны. */
function VoidBrushButton({
  id,
  label,
  selected,
  onPick,
}: {
  id: string;
  label: string;
  selected: boolean;
  onPick: (id: string, name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id, label)}
      className={`flex w-[4.5rem] flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] ${
        selected ? "border-gold bg-gold/10" : "border-border bg-secondary/30"
      }`}
    >
      <span
        className="h-8 w-8 rounded border"
        style={{
          borderColor: VOID_DOME.edge,
          background: `repeating-linear-gradient(45deg, ${VOID_DOME.badgeBg} 0 4px, ${VOID_DOME.edge}55 4px 8px)`,
        }}
      />
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}

/**
 * Кнопка кисти биом-выделения: жёлтая пунктирная гексограмма. Клетки эта
 * кисть НЕ красит — только помечает: заливку сделает `BiomeGenPanelLive`.
 * Иконка нарисована SVG-полигоном: dashed-border по clip-path гекса не
 * ложится, а SVG повторяет силуэт точно (тот же приём, что в hex-editor).
 */
function BiomeGenBrushButton({
  id,
  label,
  selected,
  onPick,
}: {
  id: string;
  label: string;
  selected: boolean;
  onPick: (id: string, name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id, label)}
      className={`flex w-[4.5rem] flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] ${
        selected ? "border-gold bg-gold/10" : "border-border bg-secondary/30"
      }`}
      title="Тап помечает клетки для биом-генератора"
    >
      <span
        className="grid h-8 w-8 place-items-center rounded"
        style={{ background: "rgba(246, 196, 83, 0.10)" }}
      >
        <svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true">
          <polygon
            points="25,3 75,3 97,50 75,97 25,97 3,50"
            fill="none"
            stroke="#f6c453"
            strokeWidth="8"
            strokeDasharray="12 8"
          />
        </svg>
      </span>
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}
