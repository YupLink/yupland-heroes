// Настройка платной «услуги» постройки в режиме бога — по её поведению:
// алтарь-буст, столб заклинаний, покои, «Забвение». Вход у всех один — конфиг
// клетки и «сохранить заплатку», поэтому выбор вынесен из AdminCellState
// (файл и так за лимитом 250 строк).
import type { BuildingEffect } from "@/lib/buildingEffect";
import { AdminBoostEditor } from "@/components/beta-raid/AdminBoostEditor";
import { AdminChambersEditor } from "@/components/beta-raid/AdminChambersEditor";
import { AdminOblivionEditor } from "@/components/beta-raid/AdminOblivionEditor";
import { AdminSpellbookEditor } from "@/components/beta-raid/AdminSpellbookEditor";

export function AdminServiceEditor({
  effect,
  config,
  onSave,
}: {
  effect: BuildingEffect;
  config: Record<string, unknown> | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  // Алтарь-буст настраивается там же, где стоит: что даёт и почём.
  if (effect === "boost") return <AdminBoostEditor config={config} onSave={onSave} />;
  // Столб заклинаний: чему учит и почём — изучение и забвение.
  if (effect === "spellbook") return <AdminSpellbookEditor config={config} onSave={onSave} />;
  // Покои: цены отдыха — прямо на живой карте.
  if (effect === "chambers") return <AdminChambersEditor config={config} onSave={onSave} />;
  // «Забвение»: цена, уровень и время эффекта.
  if (effect === "oblivion") return <AdminOblivionEditor config={config} onSave={onSave} />;
  return null;
}
