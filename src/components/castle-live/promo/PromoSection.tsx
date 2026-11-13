// Строка «Промокод» профиля: поле, «Применить» и карточка того, что выпало.
// Вынесено из CastleAccount — там только настройки профиля.
import { useState } from "react";
import { ChevronRight, Gift } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { usePromoRedeem } from "./usePromoRedeem";
import { promoToastOf } from "./promoView";
import { PromoResultCard } from "./PromoResultCard";

export function PromoSection({ wallet, telegramLinked }: { wallet: boolean; telegramLinked: boolean }) {
  const t = useT();
  // Поле открыто сразу: игрок вводит код сам — найденный в газете или где угодно.
  const [open, setOpen] = useState(true);
  const [code, setCode] = useState("");
  const promo = usePromoRedeem();
  const can = wallet && telegramLinked;
  const submit = () => {
    if (!code.trim() || promo.isPending || !can) return;
    // Не доехавшее доделывает повторный ввод того же кода — его и оставляем в поле.
    promo.mutate(code, { onSuccess: (o) => promoToastOf(o) !== "pending" && setCode("") });
  };
  return (
    <section className="castle-profile__promo">
      <button
        data-game-button="row"
        className="castle-profile__row"
        aria-expanded={open}
        aria-controls="profile-promo-form"
        onClick={() => setOpen(!open)}
      >
        <Gift aria-hidden="true" />
        <span>{t("promo.title")}</span>
        <ChevronRight className="castle-profile__chevron" aria-hidden="true" />
      </button>
      {open && (
        <form
          id="profile-promo-form"
          className="castle-profile__promo-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {promo.isSuccess ? (
            <PromoResultCard outcome={promo.data} onDone={() => promo.reset()} />
          ) : (
            <>
              <label htmlFor="profile-promo-code">{t("promo.enter")}</label>
              <input
                id="profile-promo-code"
                value={code}
                maxLength={64}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={promo.isPending}
                aria-describedby={promo.isError ? "profile-promo-error" : undefined}
                aria-invalid={promo.isError || undefined}
                onChange={(event) => {
                  setCode(event.target.value);
                  if (promo.isError) promo.reset();
                }}
              />
              <button
                data-game-button="primary"
                type="submit"
                className="castle-profile__connect"
                disabled={!code.trim() || promo.isPending || !can}
              >
                {promo.isPending ? t("promo.checking") : t("promo.apply")}
              </button>
              {!wallet && <p>{t("promo.need_wallet")}</p>}
              {wallet && !telegramLinked && <p>{t("promo.need_tg_hint")}</p>}
              {promo.isError && (
                <p id="profile-promo-error" role="alert">
                  {humanError(promo.error)}
                </p>
              )}
            </>
          )}
        </form>
      )}
    </section>
  );
}
