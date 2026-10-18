// Облик постройки в режиме бога: вид клетки в рамках ЕЁ категории.
//
// Правило владельца: поставил Ворота — облики только из категории ворот, магазина
// там быть не должно. Поэтому пикер привязан к постройке на клетке: категорию
// берём из её имени (buildingCategory), показываем облики ТОЛЬКО этой категории и
// подсвечиваем текущий. Никаких «выбери категорию / выбери функцию» — минимум
// кнопок: тап по картинке меняет внешность, механику правит соседний переключатель
// поведения. Картинки грузятся пачкой и обрезаются по краям (lib/trimImage).
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { thumb } from "@/lib/image";
import { invalidateRaidMap } from "@/lib/query";
import { uploadTrimmed } from "@/lib/trimImage";
import { buildingCategory, categoryLabelOf } from "@/lib/buildingCategory";
import { skinDisplayName } from "@/lib/skinName";
import type { CellPatch } from "./patchMapCache";
import type { PaletteAsset } from "./cellAssets";
import {
  addSkinImages,
  createSkinGroup,
  getBuildingSkins,
  deleteSkinImage,
} from "@/server/api/beta-raid/building-skins-api";

const SKINS_KEY = ["admin-building-skins"];

export function AdminSkinPicker({
  q,
  r,
  buildingName,
  skinId,
  baseId,
  onApply,
}: {
  q: number;
  r: number;
  buildingName: string;
  skinId: string | null;
  /** Настоящий building_id (без облика) — для «база»: снять облик, оставить постройку. */
  baseId: string | null;
  /** Кладёт правку в ОЧЕРЕДЬ ЧЕРНОВИКА (та же, что постройки): применится на «Выгрузить». */
  onApply: (patch: Omit<CellPatch, "q" | "r">) => void;
}) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Ключ пересоздаёт input после каждой загрузки: без этого на iOS/Android
  // WebView повторный выбор ТОГО ЖЕ файла молча игнорируется, а сброс
  // `.value = ""` в некоторых сборках не срабатывает — пользователь жалуется,
  // что после первой пачки больше ничего не грузится.
  const [inputVer, setInputVer] = useState(0);

  const skins = useQuery({ queryKey: SKINS_KEY, queryFn: () => getBuildingSkins() });

  // Категория клетки — из имени её постройки. Облики берём из групп той же
  // категории. ПЛЮС — группа уже НАДЕТОГО облика, даже если он из другой
  // категории (наследие старого пикера): иначе новый скоуп спрятал бы от админа
  // его же скин, и «на карте один визуал, подходишь — другой» стало бы хуже.
  // Новый чужой облик так не выбрать — его категории в списке нет.
  const cat = buildingCategory(buildingName);
  const allGroups = skins.data?.groups ?? [];
  const matched = allGroups.filter((g) => cat && buildingCategory(g.name) === cat);
  const currentGroup = skinId
    ? (allGroups.find((g) => g.skins.some((s) => s.id === skinId)) ?? null)
    : null;
  const shownGroups =
    currentGroup && !matched.includes(currentGroup) ? [...matched, currentGroup] : matched;
  const catSkins = shownGroups.flatMap((g) => g.skins);
  const catLabel = categoryLabelOf(buildingName) ?? currentGroup?.name ?? buildingName;

  // Предзагружаем ПОЛНОРАЗМЕРНЫЕ картинки обликов (на карте не миниатюра): без
  // этого при выборе клетка на пару секунд «пропадала», пока грузился PNG
  // (жалоба владельца). К тапу картинка уже в кэше браузера — вид встаёт сразу.
  const preloadKey = catSkins.map((s) => s.image).join("|");
  useEffect(() => {
    for (const s of catSkins) {
      const img = new Image();
      img.src = s.image;
    }
    // catSkins пересобирается каждый рендер — держим зависимость на списке ссылок.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadKey]);
  // Куда лить новые картинки: своя группа категории. Нет — заведём под именем
  // категории (её же найдём потом по buildingCategory). «+ картинки» не требует
  // отдельного «создать категорию».
  const targetGroup = matched[0] ?? null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: SKINS_KEY });
    // Карта перечитывается по событию «restored», но свой экран обновим сразу.
    invalidateRaidMap(qc);
  };

  // Применить/снять облик — через ОЧЕРЕДЬ ЧЕРНОВИКА (как и постройки): облик и
  // building_id уезжают одним патчем на «Выгрузить», без иммедиэйт-конфликта с
  // черновиком (он и давал мигание, фантомные постройки и «видно только после
  // Выгрузить»). Картинку облика заранее кладём в палитру — карта нарисует его
  // черновиком СРАЗУ, и снимок черновика её запомнит (переживёт перезагрузку).
  const apply = (skin: { id: string; name: string; image: string } | null) => {
    if (skin) {
      const key = `skin:${skin.id}`;
      // Имя облика в черновике — по тому же правилу, что на карте и в карточке
      // игрока (осмысленное имя облика, иначе имя категории/базы).
      const label = skinDisplayName(skin.name, catLabel);
      qc.setQueryData<PaletteAsset[]>(["admin-live-assets", "building"], (old) => {
        const asset: PaletteAsset = { id: key, name: label, imageUrl: skin.image, tiers: 1 };
        const arr = Array.isArray(old) ? old.filter((a) => a.id !== key) : [];
        return [...arr, asset];
      });
      onApply({ buildingSkinId: skin.id });
    } else {
      // «База» — снять облик, вернуть базовую постройку (её id знает окно клетки).
      onApply({ buildingId: baseId, buildingSkinId: null });
    }
    toast.success(skin ? "Облик выбран · «Выгрузить»" : "Облик снят · «Выгрузить»");
  };

  const drop = useMutation({
    mutationFn: (id: string) => deleteSkinImage({ data: { id } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(humanError(e)),
  });

  /** Пачка файлов в категорию клетки: обрезаем и грузим по три за раз. */
  async function onFiles(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0 || !cat) return;
    setProgress({ done: 0, total: list.length });
    try {
      // Группы под эту категорию ещё нет — заводим под её же именем (по нему
      // buildingCategory снова найдёт эту группу для клеток этой категории).
      let groupId = targetGroup?.id;
      if (!groupId) {
        const g = await createSkinGroup({ data: { name: catLabel, templateId: null } });
        groupId = g.id;
      }
      const items: Array<{ name: string; image: string }> = [];
      const LANES = 3;
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(LANES, list.length) }, async () => {
          for (let i = next++; i < list.length; i = next++) {
            const url = await uploadTrimmed(list[i]);
            items.push({ name: list[i].name.replace(/\.[^.]+$/, ""), image: url });
            setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          }
        }),
      );
      for (let i = 0; i < items.length; i += 50) {
        await addSkinImages({ data: { groupId, items: items.slice(i, i + 50) } });
      }
      toast.success(`В «${catLabel}» добавлено картинок: ${items.length}`);
      refresh();
    } catch (e) {
      toast.error(humanError(e as Error));
    } finally {
      setProgress(null);
      // Пересоздаём input целиком — надёжнее сброса `.value=""`, который на
      // некоторых WebView не отпускает предыдущий выбор.
      setInputVer((v) => v + 1);
    }
  }

  // Категории у постройки нет (Верфь, Университет и пр.) И облик не надет —
  // обликов не заводим. Если облик всё же стоит (наследие) — покажем его снять.
  if (!cat && !currentGroup) return null;

  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">Облик · {catLabel}</span>
        <button
          type="button"
          disabled={!!progress || !cat}
          title="Выбрать сразу несколько файлов — все уйдут в облики этой категории"
          className="whitespace-nowrap rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
        >
          {progress ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress.done}/{progress.total}
            </span>
          ) : (
            "+ картинки"
          )}
        </button>
        <input
          key={inputVer}
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          // `hidden` в некоторых WebView мешает click() — предпочтём стиль:
          // элемент остаётся в потоке, но не отображается.
          style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-5 gap-1">
        <button
          type="button"
          title="Базовый вид шаблона"
          onClick={() => apply(null)}
          className={`grid aspect-square place-items-center rounded border text-[9px] ${
            skinId === null
              ? "border-gold text-gold"
              : "border-dashed border-border text-muted-foreground"
          }`}
        >
          база
        </button>
        {catSkins.map((s) => {
          const active = s.id === skinId;
          return (
            <div key={s.id} className="relative">
              <button
                type="button"
                title={s.name}
                onClick={() => apply(s)}
                className={`block aspect-square w-full overflow-hidden rounded border bg-secondary/40 ${
                  active ? "border-gold ring-1 ring-gold" : "border-border"
                }`}
              >
                <img
                  src={thumb(s.image, 96, "black")}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </button>
              {active && (
                <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-gold text-background">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              <button
                type="button"
                title="Убрать картинку из категории"
                onClick={() => drop.mutate(s.id)}
                className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-background/90 text-destructive"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          );
        })}
        {/* Последняя ячейка — «+»: добавить облики в эту категорию (та же заливка,
            что «+ картинки», но прямо в сетке — её владелец и искал). */}
        <button
          type="button"
          disabled={!!progress || !cat}
          title="Добавить облики в эту категорию"
          onClick={() => fileRef.current?.click()}
          className="grid aspect-square place-items-center rounded border border-dashed border-gold/60 text-gold disabled:opacity-40"
        >
          {progress ? (
            <span className="text-[9px]">
              {progress.done}/{progress.total}
            </span>
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </button>
      </div>
      {catSkins.length === 0 && (
        <p className="text-[10px] text-muted-foreground">обликов ещё нет — добавь пачку по «+»</p>
      )}
    </div>
  );
}
