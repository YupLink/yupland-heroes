// Строка «Промокоды» в «Инструментах» профиля (только админ). Окно грузится
// лениво: пикеры админки игроку в бандл не уезжают.
import { lazy, Suspense, useState } from "react";
import { ChevronRight, TicketPercent } from "lucide-react";
import { useT } from "@/lib/i18n";

const PromoAdminModal = lazy(() =>
  import("./admin/PromoAdminModal").then((m) => ({ default: m.PromoAdminModal })),
);

/** canToken — владелец (isPayoutsAdmin): только ему строка-токен; soft — право
 *  promo_soft (не админ): только энергия и лайки, только свои коды. */
export function PromoAdminRow({ canToken, soft = false }: { canToken: boolean; soft?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-game-button="row"
        className="castle-profile__row"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <TicketPercent aria-hidden="true" />
        <span>{t("promo.adm.title")}</span>
        <ChevronRight className="castle-profile__chevron" aria-hidden="true" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <PromoAdminModal canToken={canToken} soft={soft} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
