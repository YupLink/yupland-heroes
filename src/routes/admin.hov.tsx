// Герои NFT Heroes of Valdir — 100 героев коллекции с картинками. Изначально картинка из
// самого NFT; нажал — загрузил свою: до выдачи это предустановка, после — замена сразу у
// всех, кто героя уже получил. Только админам (владелец, 17.10.2026).
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { ImageUploader } from "@/components/ImageUploader";
import { adminHovHeroes, adminSetHovPortrait } from "@/server/api/eth/hov-admin";

export const Route = createFileRoute("/admin/hov")({ component: AdminHov });


function AdminHov() {
  const qc = useQueryClient();
  const heroes = useQuery({ queryKey: ["admin-hov-heroes"], queryFn: () => adminHovHeroes() });
  const [edit, setEdit] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: { hero: string; url: string }) => adminSetHovPortrait({ data: v }),
    onSuccess: (r) => {
      toast.success(`Картинка заменена · выданных героев обновлено: ${r.templates}`);
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["admin-hov-heroes"] });
    },
    onError: (e) => toast.error(humanError(e)),
  });

  if (heroes.isPending) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="font-display text-xl font-bold">Герои NFT · Heroes of Valdir</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-muted-foreground">ГЕРОИ КОЛЛЕКЦИИ · {heroes.data?.length ?? 0}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {(heroes.data ?? []).map((h) => (
            <div key={h.hero} className="space-y-1 rounded-xl border border-border/50 bg-card p-2 text-xs">
              {edit === h.hero ? (
                <ImageUploader value={h.portrait} onChange={(url) => url && save.mutate({ hero: h.hero, url })} />
              ) : (
                <button type="button" className="block w-full" onClick={() => setEdit(h.hero)}>
                  <img src={h.portrait} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                </button>
              )}
              <div className="flex items-center gap-1 font-semibold">
                {h.lirian && <Crown aria-hidden="true" className="h-3.5 w-3.5 text-gold" />}
                <span className="truncate">{h.hero}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
