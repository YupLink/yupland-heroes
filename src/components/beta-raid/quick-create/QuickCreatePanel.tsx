// Быстрое создание объекта прямо из режима бога.
//
// ЗАЧЕМ. Чтобы завести нового босса, владелец выходил из игры в YupLink →
// админка → меню → редактор карт → создавал шаблон → возвращался тем же
// маршрутом в режим бога и только потом ставил объект. Каждый переход — своя
// загрузка; на этом уходили часы в день.
//
// КАК. Полный редактор объекта (FullObjectEditor) самодостаточен: с
// refId="new" он не правит существующий шаблон, а создаёт новый теми же
// ручками, что и редактор карт (adminSaveBossTemplate / adminCreateItem).
// Значит переписывать форму не нужно — нужен вход в неё с карты. Здесь только
// выбор вида и справочник местностей, который форма ждёт пропом.
//
// Созданный шаблон ложится в те же таблицы, поэтому сразу виден и палитре
// режима бога, и раздаче: «раздал яблоки — в следующий раз выбрал те же».
import { useMemo, useState } from "react";
import { toBody } from "@/lib/toBody";
import { useQuery } from "@tanstack/react-query";
import { adminListItems } from "@/api";
import { FullObjectEditor } from "@/components/admin/hex-editor/FullObjectEditor";
import {
  OBJECT_SUBS,
  type ObjectSub,
  type TerrainDef,
} from "@/components/admin/hex-editor/hexShared";

export function QuickCreatePanel({ onClose }: { onClose: () => void }) {
  const [sub, setSub] = useState<ObjectSub>("boss");

  // Тот же запрос и та же форма списка, что у редактора карт (ключ общий —
  // список местностей кэшируется на двоих, лишнего похода в базу нет).
  const terrainQ = useQuery({
    queryKey: ["hex-editor-items", "terrain"],
    queryFn: () => adminListItems({ data: { kind: "terrain" } }),
  });
  const terrains: TerrainDef[] = useMemo(
    () =>
      (terrainQ.data ?? [])
        .filter((i) => i.active)
        .map((i) => ({
          id: i.id,
          label: i.name,
          file: i.imageUrl ?? "",
          cost: i.statAmount ?? 1,
          meta: (i.meta as Record<string, unknown> | null) ?? undefined,
        })),
    [terrainQ.data],
  );

  return toBody(
    <>
      {/* Выбор вида — над формой, отдельным слоем: сама форма перерисовывается
          целиком при смене вида (у неё своё состояние полей на каждый вид). */}
      <div className="fixed inset-x-0 top-0 z-[151] flex justify-center px-3 pt-[calc(8px+var(--app-top,0px))]">
        <div className="flex max-w-md flex-wrap items-center gap-1 rounded-2xl border border-gold/40 bg-background/95 p-1 backdrop-blur">
          {OBJECT_SUBS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSub(s.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                sub === s.key
                  ? "bg-gold text-gold-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {/* key по виду: смена вида должна начинать форму с чистого листа, иначе
          в новом объекте остаются поля прежнего (HP босса у монетки). */}
      <FullObjectEditor
        key={sub}
        sub={sub}
        refId="new"
        cellKey="palette"
        terrains={terrains}
        onClose={onClose}
        onUpdated={onClose}
      />
    </>,
  );
}
