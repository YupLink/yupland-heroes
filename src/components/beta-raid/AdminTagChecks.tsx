// Галочки меток ассета (владелец, 25.09): к каким типам местности и к каким
// расам относится декор, постройка или облик. Несколько вариантов сразу;
// пусто = подходит всем. Метки читает генератор больших карт и поселений.
//
// Сохраняется каждая галочка сразу, минуя очередь выгрузки: метка — свойство
// шаблона, а не клетки. Правки одного ассета идут строго по очереди (scope),
// чтобы быстрые тапы не приехали на сервер вперемешку и не затёрли друг друга.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Tags } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { adminGetAssetTags, adminSetAssetTags } from "@/server/api/beta-raid/asset-tags";
import type { AssetTagKind, AssetTags } from "@/lib/raid/assetTags";

type Data = Awaited<ReturnType<typeof adminGetAssetTags>>;
type Field = "terrains" | "races";

function CheckGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  selected: readonly string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer select-none items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                on ? "border-gold bg-gold/20 text-gold" : "border-border text-muted-foreground"
              }`}
            >
              <input
                type="checkbox"
                className="h-3 w-3 accent-gold"
                checked={on}
                onChange={() => onToggle(o.value)}
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function AdminTagChecks({
  refId,
  kind,
  title,
}: {
  refId: string;
  kind: AssetTagKind;
  title?: string;
}) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ["asset-tags", refId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => adminGetAssetTags({ data: { ids: [refId] } }),
    staleTime: 60_000,
  });
  const tags: AssetTags = q.data?.tags[refId] ?? { terrains: [], races: [], auto: true };

  const save = useMutation({
    scope: { id: `asset-tags:${refId}` },
    mutationFn: (next: Pick<AssetTags, Field>) =>
      adminSetAssetTags({ data: { refId, kind, ...next } }),
    onMutate: (next) => {
      qc.setQueryData<Data>(key, (d) =>
        d ? { ...d, tags: { ...d.tags, [refId]: { ...next, auto: false } } } : d,
      );
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const toggle = (field: Field, v: string) => {
    const list = tags[field];
    const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
    save.mutate({ terrains: tags.terrains, races: tags.races, [field]: next });
  };

  const terrainName = new Map((q.data?.terrains ?? []).map((x) => [x.id, x.name]));
  const summary = [
    `${t("tags.terrain")}: ${tags.terrains.length || t("tags.any")}`,
    `${t("tags.race")}: ${tags.races.map((r) => t(`tags.race.${r}`)).join(", ") || t("tags.any")}`,
  ].join(" · ");

  return (
    <div className="w-full rounded-lg border border-border/60 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-[11px]"
      >
        <Tags className="h-3 w-3 shrink-0 text-gold" />
        <span className="font-semibold">{title ?? t("tags.title")}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
        {tags.auto && (tags.terrains.length > 0 || tags.races.length > 0) && (
          <span className="rounded border border-border px-1 text-[9px] text-muted-foreground">
            {t("tags.auto")}
          </span>
        )}
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && q.data && (
        <div className="mt-2 space-y-2">
          <CheckGroup
            title={t("tags.terrain")}
            options={q.data.terrains.map((x) => ({
              value: x.id,
              label: localizeAssetName(terrainName.get(x.id) ?? x.id, lang),
            }))}
            selected={tags.terrains}
            onToggle={(v) => toggle("terrains", v)}
          />
          <CheckGroup
            title={t("tags.race")}
            options={q.data.races.map((r) => ({ value: r, label: t(`tags.race.${r}`) }))}
            selected={tags.races}
            onToggle={(v) => toggle("races", v)}
          />
        </div>
      )}
    </div>
  );
}

/** Метки постройки на клетке: у шаблона и у надетого облика — раса живёт в обоих. */
export function AdminBuildingTags({
  baseId,
  skinId,
}: {
  baseId: string | null;
  skinId: string | null;
}) {
  const t = useT();
  return (
    <>
      {baseId && <AdminTagChecks refId={baseId} kind="building" title={t("tags.building")} />}
      {skinId && <AdminTagChecks refId={skinId} kind="skin" title={t("tags.skin")} />}
    </>
  );
}
