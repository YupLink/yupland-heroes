// Лавка зачарования в окне постройки — так же, как витрина маркета
// (BuildingExtraActions → MarketAction): окно, заголовок и закрытие — общие
// у BuildModal, здесь содержимое. Заклинания — getEnchantShop по клетке.
// Вкладки «Игрок | Админ» — только у того, кому сервер разрешил правку
// (canEdit): админ настраивает лавку прямо в окне самого здания.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getEnchantShop } from "@/server/api/beta-raid";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { useRaidMapId } from "@/components/beta-raid/useEnergyMult";
import { enchantShopKey } from "@/components/beta-raid/enchant/enchantQueries";
import { EnchantPlayer } from "@/components/beta-raid/enchant/EnchantPlayer";
import { EnchantAdmin } from "@/components/beta-raid/enchant/EnchantAdmin";
import "@/components/beta-raid/enchant/enchant.css";

type Tab = "player" | "admin";

export function EnchantAction({ q, r }: { q: number; r: number }) {
  const t = useT();
  const mapId = useRaidMapId() ?? null;
  const at = { mapId: mapId ?? "", q, r };
  const [tab, setTab] = useState<Tab>("player");
  const shop = useQuery({
    queryKey: enchantShopKey(at),
    queryFn: () => getEnchantShop({ data: at }),
    enabled: !!mapId,
    staleTime: 10_000,
    retry: 1,
  });

  if (shop.isError) {
    return <div className="ench ench-empty">{humanError(shop.error)}</div>;
  }
  if (!shop.data) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const { spells, canEdit } = shop.data;
  const shown: Tab = canEdit ? tab : "player";
  const tabBtn = (id: Tab, key: string) => (
    <button type="button" role="tab" aria-selected={shown === id} onClick={() => setTab(id)}>
      {t(key)}
    </button>
  );

  return (
    <div className="ench">
      {canEdit && (
        <div className="ench-tabs" role="tablist">
          {tabBtn("player", "enchantshop.tab_player")}
          {tabBtn("admin", "enchantshop.tab_admin")}
        </div>
      )}

      {/* Обе вкладки живут, пока открыто окно: несохранённая правка админа
          не теряется, если он заглянул во вкладку игрока. */}
      <section className="ench-panel" role="tabpanel" hidden={shown !== "player"}>
        {spells.length === 0 ? (
          <div className="ench-empty">{t("enchantshop.empty")}</div>
        ) : (
          <EnchantPlayer at={at} spells={spells} />
        )}
      </section>
      {canEdit && (
        <section className="ench-panel" role="tabpanel" hidden={shown !== "admin"}>
          <EnchantAdmin at={at} spells={spells} />
        </section>
      )}
    </div>
  );
}
