import { useQuery } from "@tanstack/react-query";
import { adminListPacks } from "@/server/api/packs";
import { adminListChipPacks } from "@/server/api/chips-admin";

export function PackPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (packId: string) => void;
}) {
  const nftPacks = useQuery({
    queryKey: ["admin", "packs", "active-only"],
    queryFn: () => adminListPacks({ data: { activeOnly: true } }),
  });
  const chipPacks = useQuery({
    queryKey: ["admin", "chip-packs", "all"],
    queryFn: () => adminListChipPacks(),
  });
  const chipList = (chipPacks.data ?? [])
    .filter((p) => p.active && (!p.exhausted || p.id === value))
    .map((p) => ({
      id: p.id,
      name: p.exhausted ? `${p.name} (исчерпан)` : p.name,
      imageUrl: p.coverImageUrl,
      description: p.description,
    }));
  const nftList = (nftPacks.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl,
    description: p.description,
  }));
  const all = [...chipList, ...nftList];
  const selected = all.find((p) => p.id === value);
  const loading = nftPacks.isLoading || chipPacks.isLoading;
  return (
    <div className="space-y-1.5">
      {all.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background px-2 py-2 text-xs text-muted-foreground">
          {loading ? "Загружаем паки…" : "Нет активных паков. Создай в /admin/chips или /admin/packs."}
        </div>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-gold/50">
          <option value="">— выбери пак —</option>
          {chipList.length > 0 && (
            <optgroup label="🃏 Чип-паки (Фишки)">
              {chipList.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          )}
          {nftList.length > 0 && (
            <optgroup label="📦 NFT-паки">
              {nftList.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      )}
      {selected && selected.imageUrl && (
        <div className="flex items-center gap-2">
          <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-background">
            <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 text-[11px] text-muted-foreground">
            {selected.description ? <span className="line-clamp-2">{selected.description}</span> : <span>Пак выбран</span>}
          </div>
        </div>
      )}
    </div>
  );
}
