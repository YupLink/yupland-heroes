// Выбор местностей для раздела раздачи.
//
// Раньше местность знал только шаблон: радужный босс вставал на радугу, потому
// что так написано в его карточке. Владелец просил обратного — «выбрал три
// местности и раскидал по ним», «пятьдесят в аду». Поэтому здесь отмечают
// местности, и этот выбор шаблонную ПЕРЕБИВАЕТ; ничего не отмечено — всё как
// было.
//
// У каждой отмеченной можно задать своё число. Пусто — делит общее «Сколько»
// раздела поровну с такими же (правило написано под списком, чтобы админ не
// гадал, куда уедет остаток).
import { useQuery } from "@tanstack/react-query";
import { adminListItems } from "@/api";
import type { LandDraft } from "./scatterDraft";

export function ScatterLandPicker({
  lands,
  onLands,
}: {
  lands: LandDraft[];
  onLands: (next: LandDraft[]) => void;
}) {
  // Ключ общий с редактором карт и создаватором: список местностей один на всех,
  // лишнего похода в базу при открытии панели нет.
  const q = useQuery({
    queryKey: ["hex-editor-items", "terrain"],
    queryFn: () => adminListItems({ data: { kind: "terrain" } }),
  });
  const all = (q.data ?? []).filter((i) => i.active);
  const picked = new Map(lands.map((l) => [l.terrainId, l]));

  const toggle = (id: string) => {
    if (picked.has(id)) onLands(lands.filter((l) => l.terrainId !== id));
    else onLands([...lands, { terrainId: id, count: "" }]);
  };
  const setCount = (id: string, count: string) =>
    onLands(lands.map((l) => (l.terrainId === id ? { ...l, count } : l)));

  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
        Местность · не отмечено = как у шаблона
      </div>
      {q.isLoading ? (
        <p className="py-1 text-[11px] text-muted-foreground">Загрузка…</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {all.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                picked.has(t.id)
                  ? "border-gold/60 bg-gold/10 text-gold"
                  : "border-border text-muted-foreground"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {lands.length > 0 && (
        <div className="mt-2 space-y-1">
          {lands.map((l) => {
            const name = all.find((t) => t.id === l.terrainId)?.name ?? l.terrainId;
            return (
              <label key={l.terrainId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px]">{name}</span>
                <input
                  value={l.count}
                  onChange={(e) => setCount(l.terrainId, e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  placeholder="доля"
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm tabular-nums"
                />
              </label>
            );
          })}
          <p className="text-[10px] leading-tight text-muted-foreground">
            Своё число — сколько сюда; пусто — делят общее «Сколько» поровну, остаток уходит первой
            в списке.
          </p>
        </div>
      )}
    </div>
  );
}
