import { useMutation, useQueryClient } from "@tanstack/react-query";
import { selectMyHero } from "@/server/api/heroes-select";
import { invalidateHeroQueries } from "@/lib/query";
import { humanError } from "@/lib/humanError";
import { ArrowLeftRight } from "lucide-react";

/** Explicit player action. Eligibility, cooldowns and waking stay on the server. */
export function TavernSelectHero({ hero, active, ru, onSelected }: {
  hero: { id: string | null; itemId?: string | null; templateId: string; name: string };
  active: boolean; ru: boolean; onSelected: (id: string) => void;
}) {
  const qc = useQueryClient();
  const pick = useMutation({
    mutationFn: () => selectMyHero({ data: { heroId: hero.id, itemId: hero.id ? undefined : hero.itemId ?? undefined, templateId: hero.id ? undefined : hero.templateId } }),
    onError: () => invalidateHeroQueries(qc, ["beta-raid-state"]),
    onSuccess: (result) => {
      invalidateHeroQueries(qc, ["my-energy", "my-like-balance", "beta-raid-state"]);
      if (result.heroId) onSelected(result.heroId);
    },
  });
  if (active || pick.isSuccess) return null;
  return <div data-hero-select className="space-y-2">
    <button type="button" data-game-button="primary" className="min-h-11 w-full" disabled={pick.isPending} onClick={() => pick.mutate()}>
      <ArrowLeftRight aria-hidden="true" />
      {pick.isPending ? (ru ? "Выбираем…" : "Selecting…") : (ru ? "Сделать активным" : "Make active")}
    </button>
    {pick.isError && <p role="alert" className="text-sm text-destructive">{humanError(pick.error)}</p>}
  </div>;
}
