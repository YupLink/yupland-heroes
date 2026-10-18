// Шапка и описание окна энергии (дизайн Ангелины): «назад», значок, заголовок,
// «закрыть»; у «способа оплаты» пакета — строка с ящиком энергии.
import { ArrowLeft, X } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function EnergyHead({
  ru,
  title,
  back,
  busy,
  pack,
  topUp,
  onBack,
  onClose,
}: {
  ru: boolean;
  title: string;
  back: boolean;
  busy: boolean;
  /** «+N энергии» на экране выбора оплаты пакета. */
  pack: string | null;
  topUp: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <header className="energy-buy__header">
        {back && (
          <button type="button" className="energy-buy__back" disabled={busy} onClick={onBack} aria-label={ru ? "Назад" : "Back"}>
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
        <img src="/resources/energy.png" alt="" aria-hidden="true" />
        <DialogTitle>{title}</DialogTitle>
        <button type="button" className="energy-buy__close" disabled={busy} onClick={onClose} aria-label={ru ? "Закрыть" : "Close"}>
          <X aria-hidden="true" />
        </button>
      </header>
      <DialogDescription className={pack || topUp ? "energy-buy__description" : "sr-only"}>
        {pack ? (
          <>
            <img src="/resources/energy.png" alt="" aria-hidden="true" />
            <strong>{pack}</strong>
            <span>{ru ? "Выбери способ оплаты" : "Choose a payment method"}</span>
            <img className="energy-buy__energy-crate" src="/design-assets/purchase/energy-pack-crate.webp" alt="" aria-hidden="true" />
          </>
        ) : topUp ? (
          ru ? "Пополнить счёт Казны и вернуться к выбранной покупке." : "Add Stars to Treasury and return to your selected purchase."
        ) : ru ? (
          "Предложения для покупки энергии"
        ) : (
          "Energy purchase offers"
        )}
      </DialogDescription>
    </>
  );
}
