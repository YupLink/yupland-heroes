// «Сохранить шаблоном» в окне точки спавна: та же настройка (радиус и строки
// мобов) уходит в шаблон, которым потом ставят точки тапами (SpawnStampBar).
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminSaveSpawnTemplate } from "@/server/api/beta-raid/spawn-point/spawn-template-api";
import type { SpawnPointMob } from "@/lib/raid/spawnPoint";
import { SPAWN_TEMPLATES_KEY } from "./SpawnStampBar";

const field =
  "min-w-0 flex-1 rounded-lg border border-border bg-background px-1.5 py-1 text-[11px]";
const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

export function SaveAsTemplate({
  payload,
  defaultName,
  en,
}: {
  payload: { radius: number; mobs: SpawnPointMob[] } | null;
  defaultName: string;
  en: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => adminSaveSpawnTemplate({ data: { name: (name ?? "").trim(), ...payload! } }),
    onSuccess: () => {
      toast.success(en ? "Template saved" : "Шаблон сохранён");
      setName(null);
      void qc.invalidateQueries({ queryKey: SPAWN_TEMPLATES_KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  if (name === null) {
    return (
      <button
        type="button"
        className={btn}
        disabled={!payload}
        onClick={() => setName(defaultName)}
      >
        {en ? "Save as template" : "Сохранить шаблоном"}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        className={field}
        value={name}
        maxLength={60}
        autoFocus
        aria-label={en ? "Template name" : "Имя шаблона"}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="button"
        className={`${btn} border-violet-400/60 text-violet-200`}
        disabled={!payload || !name.trim() || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
        {en ? "Save" : "Сохранить"}
      </button>
    </div>
  );
}
