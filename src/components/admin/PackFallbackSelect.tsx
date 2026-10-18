// Выбор пака-замены: чем подменять этот пак, когда его коллекции выбраны.
//
// Список паков берём тем же ключом, что и панель, — форма пака лежит на два
// уровня ниже списка, и прокидывать его пропсами через карточку значило бы
// тащить данные сквозь чужой компонент ради одного селекта.
import { useQuery } from "@tanstack/react-query";
import { adminListChipPacks } from "@/server/api/chips-admin";

export function PackFallbackSelect({
  currentId,
  value,
  onChange,
}: {
  /** Редактируемый пак: сам себе заменой быть не может. */
  currentId?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const packs = useQuery({
    queryKey: ["admin", "chip-packs"],
    queryFn: () => adminListChipPacks(),
    staleTime: 60_000,
  });
  const options = (packs.data ?? []).filter((p) => p.id !== currentId);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Замена, когда запас кончится
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
      >
        <option value="">— нет (пак просто перестанет открываться)</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.exhausted ? " · запас кончился" : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">
        Когда коллекции этого пака выбраны, открытие и выдача (награды на карте, дропы, раздачи)
        идут по замене. Цепочка допустима: замена может иметь свою замену.
      </p>
    </div>
  );
}
