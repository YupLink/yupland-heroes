// Дропдаун созданных артефактов/героев (для приза-предмета за место).
// Вынесен из RewardConfigEditor.tsx без изменений — тот перерос лимит файла.
import { useQuery } from "@tanstack/react-query";
import { adminListItems } from "@/server/api/items";

export function ItemPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const arts = useQuery({
    queryKey: ["admin-items", "artifact"],
    queryFn: () => adminListItems({ data: { kind: "artifact" } }),
  });
  const heroes = useQuery({
    queryKey: ["admin-items", "hero"],
    queryFn: () => adminListItems({ data: { kind: "hero" } }),
  });
  const list = [...(arts.data ?? []), ...(heroes.data ?? [])].filter(
    (i) => i.active || i.id === value,
  );
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-gold/50"
    >
      <option value="">— выбери предмет —</option>
      {list.map((i) => (
        <option key={i.id} value={i.id}>
          {i.kind === "hero" ? "♞ " : "◆ "}
          {i.name}
          {i.rarity ? ` (${i.rarity})` : i.level != null ? ` (${i.level}★)` : ""}
        </option>
      ))}
    </select>
  );
}
