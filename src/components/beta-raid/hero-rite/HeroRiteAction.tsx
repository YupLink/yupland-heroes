// Зачарование героев в окне постройки — так же, как лавка артефактов
// (EnchantAction): окно, заголовок и закрытие — общие у BuildModal, здесь
// содержимое. Обряды — getHeroRiteShop по клетке; вкладки «Игрок | Админ» —
// только у того, кому сервер разрешил правку (canEdit).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getHeroRiteShop } from "@/server/api/beta-raid";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { useRaidMapId } from "@/components/beta-raid/useEnergyMult";
import { heroRiteKey } from "@/components/beta-raid/hero-rite/heroRiteQueries";
import { HeroRitePlayer } from "@/components/beta-raid/hero-rite/HeroRitePlayer";
import { HeroRiteAdmin } from "@/components/beta-raid/hero-rite/HeroRiteAdmin";
import "@/components/beta-raid/enchant/enchant.css";
import "@/components/beta-raid/hero-rite/hero-rite.css";

type Tab = "player" | "admin";

export function HeroRiteAction({ q, r }: { q: number; r: number }) {
  const t = useT();
  const mapId = useRaidMapId() ?? null;
  const at = { mapId: mapId ?? "", q, r };
  const [tab, setTab] = useState<Tab>("player");
  const shop = useQuery({
    queryKey: heroRiteKey(at),
    queryFn: () => getHeroRiteShop({ data: at }),
    enabled: !!mapId,
    staleTime: 10_000,
    retry: 1,
  });

  if (shop.isError) return <div className="ench ench-empty">{humanError(shop.error)}</div>;
  if (!shop.data) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const { rites, canEdit } = shop.data;
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
      {/* Обе вкладки живут, пока открыто окно: несохранённая правка админа не теряется. */}
      <section className="ench-panel" role="tabpanel" hidden={shown !== "player"}>
        {rites.length === 0 ? (
          <div className="ench-empty">{t("herorite.empty")}</div>
        ) : (
          <HeroRitePlayer at={at} rites={rites} />
        )}
      </section>
      {canEdit && (
        <section className="ench-panel" role="tabpanel" hidden={shown !== "admin"}>
          <HeroRiteAdmin at={at} rites={rites} />
        </section>
      )}
    </div>
  );
}
