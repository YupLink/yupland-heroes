// Окно точки спавна (режим бога): радиус и строки мобов (SpawnPointMobRow),
// «+ моб», «Сохранить» — точка пересобирает своих мобов, они встают минутным
// проходом (в свою погоду); «Убрать точку». Поверх окна клетки — порталом.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { adminListBossTemplates } from "@/server/api/raid-admin";
import { adminListRewardTokens } from "@/server/api/boss";
import {
  adminRemoveSpawnPoint,
  adminSaveSpawnPoint,
} from "@/server/api/beta-raid/spawn-point/spawn-point-api";
import {
  POINT_MAX_MOBS,
  POINT_MAX_ROWS,
  POINT_RADIUS,
  pointMobTotal,
  type SpawnPointView,
} from "@/lib/raid/spawnPoint";
import { templateName } from "@/lib/raid/spawnTemplate";
import { SpawnPointMobRow, type MobOption } from "./SpawnPointMobRow";
import { SaveAsTemplate } from "./SaveAsTemplate";
import { SPAWN_POINTS_KEY } from "./useSpawnMarks";
import {
  NEW_POINT_RADIUS,
  newMobDraft,
  pointPayload,
  toMobDraft,
  type PointDraft,
} from "./spawnPointDraft";

const field = "rounded-lg border border-border bg-background px-1.5 py-1 text-[11px]";
const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

export function SpawnPointEditor({
  q,
  r,
  point,
  en,
  onClose,
}: {
  q: number;
  r: number;
  point: SpawnPointView | null;
  en: boolean;
  onClose: () => void;
}) {
  const p = (ru: string, e: string) => (en ? e : ru);
  const qc = useQueryClient();
  const bosses = useQuery({
    queryKey: ["hex-editor-boss-templates"],
    queryFn: () => adminListBossTemplates(),
  });
  const tokens = useQuery({
    queryKey: ["reward-tokens", "symbols"],
    queryFn: () => adminListRewardTokens(),
  });
  const mobs: MobOption[] = (bosses.data?.templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    rewardConfig: t.rewardConfig ?? null,
  }));
  const [d, setD] = useState<PointDraft>(() =>
    point
      ? { radius: point.radius, mobs: point.mobs.map(toMobDraft) }
      : { radius: NEW_POINT_RADIUS, mobs: [] },
  );
  // Новая точка — сразу одна строка с первым мобом из списка.
  const first = mobs[0]?.id ?? "";
  useEffect(() => {
    if (first && d.mobs.length === 0 && !point) setD((x) => ({ ...x, mobs: [newMobDraft(first)] }));
  }, [first, d.mobs.length, point]);

  const done = () => {
    void qc.invalidateQueries({ queryKey: ["admin-spawn-point", q, r] });
    void qc.invalidateQueries({ queryKey: ["admin-mob-spawn"] });
    void qc.invalidateQueries({ queryKey: SPAWN_POINTS_KEY });
    onClose();
  };
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
  const payload = pointPayload(d);
  const save = useMutation({
    mutationFn: () => adminSaveSpawnPoint({ data: { q, r, ...payload! } }),
    onSuccess: (res) => {
      toast.success(
        res.placed < res.wanted
          ? p(
              `Точка сохранена: мест хватило на ${res.placed} из ${res.wanted}`,
              `Point saved: room for ${res.placed} of ${res.wanted}`,
            )
          : p(
              "Точка сохранена — мобы встанут в течение минуты",
              "Point saved — mobs appear within a minute",
            ),
      );
      done();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => adminRemoveSpawnPoint({ data: { q, r } }),
    onSuccess: () => {
      toast.success(p("Точка убрана", "Point removed"));
      done();
    },
    onError: fail,
  });
  const busy = save.isPending || remove.isPending;
  const total = pointMobTotal(d.mobs);
  const setMob = (i: number) => (m: PointDraft["mobs"][number]) =>
    setD((x) => ({ ...x, mobs: x.mobs.map((y, j) => (j === i ? m : y)) }));

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-display text-sm font-bold">
            {p("Точка спавна", "Spawn point")} {q}, {r}
          </h4>
          <button
            type="button"
            onClick={onClose}
            aria-label={p("закрыть", "close")}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <select
            className={field}
            value={d.radius}
            onChange={(e) => setD((x) => ({ ...x, radius: +e.target.value }))}
          >
            {POINT_RADIUS.map((n) => (
              <option key={n} value={n}>
                {n === 0
                  ? p("только эта клетка", "this tile only")
                  : p(`радиус ${n} кл.`, `radius ${n} tiles`)}
              </option>
            ))}
          </select>
          {bosses.isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            d.mobs.map((m, i) => (
              <SpawnPointMobRow
                key={i}
                d={m}
                mobs={mobs}
                tokens={tokens.data ?? []}
                en={en}
                onChange={setMob(i)}
                onRemove={
                  d.mobs.length > 1
                    ? () => setD((x) => ({ ...x, mobs: x.mobs.filter((_, j) => j !== i) }))
                    : undefined
                }
              />
            ))
          )}
          {first && d.mobs.length < POINT_MAX_ROWS && (
            <button
              type="button"
              className={btn}
              onClick={() => setD((x) => ({ ...x, mobs: [...x.mobs, newMobDraft(first)] }))}
            >
              {p("+ моб", "+ mob")}
            </button>
          )}
          <p
            className={`text-[11px] ${total > POINT_MAX_MOBS ? "text-destructive" : "text-muted-foreground"}`}
          >
            {p(`Всего мобов: ${total} из ${POINT_MAX_MOBS}`, `Mobs: ${total} of ${POINT_MAX_MOBS}`)}
          </p>
          <SaveAsTemplate
            payload={payload}
            defaultName={templateName(d.radius, d.mobs, new Map(mobs.map((m) => [m.id, m.name])))}
            en={en}
          />
        </div>
        <div className="flex shrink-0 gap-2 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <button
            type="button"
            className={`${btn} flex-1 border-gold/60 text-gold`}
            disabled={!payload || busy}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
            {p("Сохранить", "Save")}
          </button>
          {point && (
            <button type="button" className={btn} disabled={busy} onClick={() => remove.mutate()}>
              {p("Убрать точку", "Remove point")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
