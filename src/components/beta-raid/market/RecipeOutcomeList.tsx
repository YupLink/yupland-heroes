// Список исходов рецепта (ПРАВИЛА §8.104) — один на оба окна: «Можно получить»
// (справа шанс) и «Выпало» (справа сколько легло). Строки — как в окне
// «что выпало» ломбарда: картинка, имя, число.
import { CircleSlash } from "lucide-react";
import { thumb } from "@/lib/image";
import type { OutcomeFace } from "./recipeView";

export type OutcomeRow = { key: string; face: OutcomeFace; right: string };

export function RecipeOutcomeList({ rows }: { rows: readonly OutcomeRow[] }) {
  return (
    <ul className="max-h-[45dvh] space-y-1 overflow-y-auto">
      {rows.map(({ key, face, right }) => (
        <li
          key={key}
          className="flex items-center gap-2 rounded-lg bg-secondary/30 px-2 py-1 text-sm"
        >
          <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary/50">
            {face.image ? (
              <img
                src={face.pixel ? face.image : thumb(face.image, 64)}
                alt=""
                className={`absolute inset-0 h-full w-full object-contain ${face.pixel ? "p-1 [image-rendering:pixelated]" : ""}`}
              />
            ) : (
              <CircleSlash className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">{face.label}</span>
          <span className="font-bold tabular-nums">{right}</span>
        </li>
      ))}
    </ul>
  );
}
