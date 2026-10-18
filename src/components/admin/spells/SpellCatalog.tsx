// Каталог заклинаний: список, кнопка «завести» и переключатель «в игре».
//
// Удаления нет намеренно: на шаблон ссылаются книги героев (FK RESTRICT), и
// убрать заклинание из игры можно только галочкой — выученное у игроков
// остаётся, из витрин и книг пропадает.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Pencil, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { thumb } from "@/lib/image";
import { boostListText } from "@/lib/hero/boost";
import {
  adminListSpells,
  adminSaveSpell,
  adminSetSpellActive,
} from "@/server/api/beta-raid/spell-admin";
import type { SpellTpl } from "@/server/api/beta-raid/spell-tpl";
import { SpellEditor } from "./SpellEditor";
import {
  KIND_LABELS,
  cooldownHint,
  draftOf,
  EMPTY_SPELL,
  payloadOf,
  type SpellDraft,
} from "./spellDraft";

const KEY = ["admin-spells"] as const;

export function SpellCatalog() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SpellDraft | null>(null);

  const listQ = useQuery({ queryKey: KEY, queryFn: () => adminListSpells() });
  const spells = (listQ.data ?? []) as SpellTpl[];

  const save = useMutation({
    mutationFn: (d: SpellDraft) => adminSaveSpell({ data: payloadOf(d) }),
    onSuccess: () => {
      toast.success(draft?.id ? "Сохранено" : "Заклинание заведено");
      setDraft(null);
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => adminSetSpellActive({ data: v }),
    onSuccess: (r) => {
      toast.success(r.active ? "Вернули в игру" : "Убрали из игры");
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 pb-24">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground">
          <Wand2 className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Заклинания</h1>
          <p className="text-xs text-muted-foreground">
            Каталог для книги героя. Учат им у столба заклинаний — какие именно, задаётся у самого
            столба (режим бога → «Поведение постройки» → Столб заклинаний).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY_SPELL })}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium"
        >
          <Plus className="h-4 w-4" /> Завести
        </button>
      </header>

      {listQ.isPending && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      )}

      {listQ.isError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {humanError(listQ.error)}
        </p>
      )}

      {!listQ.isPending && spells.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Каталог пуст. Заведи первое заклинание кнопкой выше.
        </div>
      )}

      <div className="space-y-1.5">
        {spells.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-3 rounded-xl border bg-card p-3 ${
              s.active ? "border-border" : "border-border/50 opacity-60"
            }`}
          >
            {s.image ? (
              <img
                src={thumb(s.image, 80)}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary/50">
                <Wand2 className="h-5 w-5 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-medium">{s.name}</span>
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  {KIND_LABELS[s.kind]}
                </span>
                {!s.active && (
                  <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[9px] text-destructive">
                    не в игре
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {s.energyCost} энергии · {cooldownHint(s.cooldownMinutes)}
                {s.minInt > 0 ? ` · интеллект от ${s.minInt}` : ""}
              </div>
              {s.effects.length > 0 && (
                <div className="truncate text-[11px] text-gold">
                  {boostListText(s.effects, "ru")}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDraft(draftOf(s))}
              aria-label="Править"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
              aria-label={s.active ? "Убрать из игры" : "Вернуть в игру"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground"
            >
              {s.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
        ))}
      </div>

      {draft && (
        <SpellEditor
          value={draft}
          onChange={setDraft}
          onSave={() => save.mutate(draft)}
          saving={save.isPending}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}
