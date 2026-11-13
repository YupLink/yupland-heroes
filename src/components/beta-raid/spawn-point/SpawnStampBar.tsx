// Полоска «Точки спавна» в режиме бога: выбрать шаблон — дальше тап по клетке
// ставит точку из него (useSpawnStamp); «—» — обычная правка. Шаблоны
// сохраняются в окне точки («Сохранить шаблоном»). Корзина — удалить шаблон.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  adminDeleteSpawnTemplate,
  adminListSpawnTemplates,
} from "@/server/api/beta-raid/spawn-point/spawn-template-api";

export const SPAWN_TEMPLATES_KEY = ["admin-spawn-templates"] as const;

export function SpawnStampBar({
  template,
  onPick,
}: {
  template: string | null;
  onPick: (id: string | null) => void;
}) {
  const en = useLang() === "en";
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: SPAWN_TEMPLATES_KEY,
    queryFn: () => adminListSpawnTemplates(),
    staleTime: 60_000,
  });
  const templates = list.data?.templates ?? [];
  const remove = () => {
    if (!template) return;
    void adminDeleteSpawnTemplate({ data: { id: template } })
      .then(() => {
        onPick(null);
        void qc.invalidateQueries({ queryKey: SPAWN_TEMPLATES_KEY });
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));
  };
  if (!templates.length) return null;

  return (
    <div className="mx-2 flex items-center gap-1.5 rounded-2xl border border-violet-400/40 bg-card px-2 py-1.5">
      <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden="true" />
      <select
        aria-label={en ? "Spawn point template" : "Шаблон точки спавна"}
        className={`min-w-0 flex-1 rounded-lg border bg-background px-1.5 py-1 text-[11px] ${
          template ? "border-violet-400/60 text-violet-200" : "border-border"
        }`}
        value={template ?? ""}
        onChange={(e) => onPick(e.target.value || null)}
      >
        <option value="">{en ? "Spawn points: —" : "Точки спавна: —"}</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {template && (
        <button
          type="button"
          onClick={remove}
          aria-label={en ? "Delete template" : "Удалить шаблон"}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
