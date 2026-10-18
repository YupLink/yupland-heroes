// Блок выбора шаблона внутри FullObjectEditor — вынесено отдельно, чтобы
// основной компонент не перевалил за лимит в 250 строк (§13 ПРАВИЛА.md).
import { FolderOpen, Skull } from "lucide-react";
import { thumb } from "@/lib/image";
import type { adminListBossTemplates } from "@/server/api/raid-admin";

type BossTemplate = Awaited<ReturnType<typeof adminListBossTemplates>>["templates"][number];

export function FullObjectEditorTemplates({
  templates,
  show,
  onToggleShow,
  onPick,
}: {
  templates: BossTemplate[];
  show: boolean;
  onToggleShow: () => void;
  onPick: (t: BossTemplate) => void;
}) {
  return (
    <>
      <button onClick={onToggleShow} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 py-2 text-xs font-medium">
        <FolderOpen className="h-4 w-4" /> Загрузить шаблон ({templates.length})
      </button>
      {show && (
        <div className="space-y-1 rounded-lg border border-border bg-secondary/20 p-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg bg-card p-2">
              {t.imageUrl ? <img src={thumb(t.imageUrl, 64)} className="h-8 w-8 rounded object-cover" alt="" /> : <span className="flex h-8 w-8 items-center justify-center rounded bg-secondary text-gold"><Skull className="h-4 w-4" /></span>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.name}</div>
                {/* Уровень рядом с HP: по нему боссов отбирают при восстановлении. */}
                <div className="text-[11px] text-muted-foreground">
                  {(t as { level?: number }).level ?? 1} Lv · HP {t.maxHp.toLocaleString()}
                </div>
              </div>
              <button onClick={() => onPick(t)} className="rounded bg-gold/20 px-2 py-1 text-[11px] font-medium text-gold">Взять</button>
            </div>
          ))}
          {templates.length === 0 && <div className="p-2 text-center text-xs text-muted-foreground">Пока пусто</div>}
        </div>
      )}
    </>
  );
}
