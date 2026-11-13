// Шаблоны городов острова (владелец, 31.10.2026): Ангелина рисует город на своём
// острове, жмёт «Сохранить» и тапает по ратуше — раскладка уходит в шаблон;
// включённые шаблоны генератор ставит на новые острова вместо выращенных городов.
import { useEffect, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import type { useAdminLive } from "../useAdminLive";
import { townTemplateText } from "./townTemplateText";
import { useTownTemplates } from "./useTownTemplates";

export function TownTemplatePanel({ live }: { live: ReturnType<typeof useAdminLive> }) {
  const t = townTemplateText(useLang());
  const { templates, save, toggle, remove } = useTownTemplates(t);
  const [name, setName] = useState("");
  /** «Сохранить» нажата — следующий тап в «Правке» выбирает ратушу. */
  const [armed, setArmed] = useState(false);
  /** Корзина спросила «точно?» у этого шаблона. */
  const [ask, setAsk] = useState<string | null>(null);
  const { cell, setCell } = live;
  const saveTpl = save.mutate;

  // Ушла из «Правки» — тап больше не выбирает ратушу.
  useEffect(() => {
    if (live.mode !== "inspect") setArmed(false);
  }, [live.mode]);

  useEffect(() => {
    if (!armed || !cell) return;
    setArmed(false);
    setCell(null);
    saveTpl({ name: name.trim(), q: cell.q, r: cell.r }, { onSuccess: () => setName("") });
  }, [armed, cell, name, saveTpl, setCell]);

  const arm = () => {
    if (live.brush.pending > 0) {
      toast(t.uploadFirst, { id: "tpl-upload-first" });
      return;
    }
    setCell(null);
    live.setMode("inspect");
    setArmed(true);
    toast(t.tapHall, { id: "tpl-tap-hall" });
  };

  const tapDelete = (id: string) => {
    if (ask !== id) {
      setAsk(id);
      return;
    }
    setAsk(null);
    remove.mutate(id);
  };

  return (
    <div className="mx-2 mt-1.5 rounded-2xl border border-gold/30 bg-card p-2">
      <p className="mb-1 text-[11px] font-semibold text-gold">{t.title}</p>
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder={t.name}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[12px]"
        />
        <button
          type="button"
          onClick={arm}
          disabled={!name.trim() || save.isPending}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold disabled:opacity-40",
            armed ? "bg-gold/15 text-gold" : "gradient-gold text-gold-foreground",
          )}
        >
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {armed ? t.tapHall : t.save}
        </button>
      </div>
      {templates.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {templates.map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate">{tpl.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {t.buildings(tpl.buildings)}
              </span>
              <Switch
                checked={tpl.active}
                disabled={toggle.isPending}
                onCheckedChange={(v) => toggle.mutate({ id: tpl.id, active: v })}
              />
              <button
                type="button"
                onClick={() => tapDelete(tpl.id)}
                disabled={remove.isPending}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] disabled:opacity-40",
                  ask === tpl.id
                    ? "border-destructive/60 bg-destructive/10 text-destructive"
                    : "border-border text-muted-foreground",
                )}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {ask === tpl.id ? t.deleteAsk : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
