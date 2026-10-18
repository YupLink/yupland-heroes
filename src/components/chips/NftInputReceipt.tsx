// Квитанция прошлого ввода NFT: показываем при заходе в игру, если игрок так и
// не прочитал итог (закрыл окно, перезагрузил страницу, свернул Telegram).
//
// Снимок читаем ОДИН раз при монтировании: результат, полученный в этой же
// сессии, покажет сама модалка — иначе два одинаковых экрана поверх друг друга.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { gotoChipsSub, type ChipsSubTab } from "@/lib/chipsNav";
import { NftDepositResult } from "./NftDepositResult";
import { clearOutcome, readOutcome, type DepositOutcome } from "./nftDepositOutcome";

export function NftInputReceipt() {
  const t = useT();
  // Читаем ПОСЛЕ монтирования, а не в инициализаторе: на сервере localStorage
  // нет, и разное дерево на SSR и на клиенте роняет гидрацию (грабли 25.07 —
  // в Safari после такого переставали работать кнопки).
  const [outcome, setOutcome] = useState<DepositOutcome | null>(null);
  useEffect(() => setOutcome(readOutcome()), []);
  if (!outcome || typeof document === "undefined") return null;

  const done = () => {
    clearOutcome();
    setOutcome(null);
  };
  const go = (sub: ChipsSubTab) => {
    done();
    gotoChipsSub(sub);
  };

  return createPortal(
    <NftDepositResult
      outcome={outcome}
      position="fixed"
      hint={t("chips.nft_receipt_hint")}
      onGo={go}
      onDismiss={done}
    />,
    document.body,
  );
}
