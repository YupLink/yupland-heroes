// Награда дропа «Товар»: товар маркета сеткой картинок (как у грядки и мистик-бокса).
// Имя и картинку кладём в ярус — карточка дропа показывает их без запросов.
import { useQuery } from "@tanstack/react-query";
import { CustomItemGrid } from "@/components/admin/reward/RewardKindPickers";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";

export type GoodsPick = { id: string; name: string; image: string | null };

export function GoodsPicker({
  itemId,
  onPick,
}: {
  itemId: string;
  onPick: (g: GoodsPick) => void;
}) {
  // Тот же ключ, что у CustomItemGrid: справочник один, второго запроса нет.
  const q = useQuery({
    queryKey: ["custom-items"],
    queryFn: () => listCustomItems(),
    staleTime: 60_000,
  });
  return (
    <CustomItemGrid
      itemId={itemId}
      onPick={(id) => {
        const it = q.data?.find((x) => x.id === id);
        onPick({ id, name: it?.name ?? id, image: it?.image ?? null });
      }}
    />
  );
}
