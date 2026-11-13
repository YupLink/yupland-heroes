// /crown — «Корона гречневого королевства» по ссылке (владелец, 08.11.2026: «чтобы мы
// могли дать эту ссылку кому-то, и этот кто-то мог играть, войдя кошельком»; «вход через
// эту ссылку — именно по кошельку NEAR, только тут и только так»).
// Вход — кнопкой «Войти кошельком NEAR» (CrownLogin); прежняя сессия игры (Telegram) не
// в счёт. Вошёл кошельком здесь — после перезагрузки страницы сразу игра («кош
// отлетает — такого быть не должно»): браузер помнит, каким кошельком входили по ссылке,
// и сессия должна быть той же. Игра — та же рамка, что на карте (BuckwheatFrame, site
// link). Выход — в YupLand Heroes: новичок там выбирает расу и попадает на остров.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { BuckwheatFrame } from "@/components/buckwheat/BuckwheatOverlay";
import { CrownLogin } from "@/components/buckwheat/CrownLogin";

export const Route = createFileRoute("/crown")({
  head: () => ({
    meta: [
      { title: "Корона гречневого королевства — YupLand Heroes" },
      { property: "og:title", content: "Корона гречневого королевства — YupLand Heroes" },
      { property: "og:url", content: "https://service.yupland.io/crown" },
    ],
  }),
  component: CrownPage,
});

const KEY = "crown-wallet";
const readWallet = (): string | null => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const saveWallet = (wallet: string) => {
  try {
    window.localStorage.setItem(KEY, wallet);
  } catch {
    /* приватный режим — войдёт ещё раз */
  }
};

function CrownPage() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const [entered, setEntered] = useState(false);
  const wallet = session.data?.wallet ?? null;
  const inside = entered || (!!wallet && typeof window !== "undefined" && readWallet() === wallet);
  // Открыли игру — держим её: перезапрос сессии не должен пересоздавать окно игры
  // (иначе всё грузится заново и картинки «моргают», 08.11).
  useEffect(() => {
    if (inside && !entered) setEntered(true);
  }, [inside, entered]);
  if (!inside && session.isPending) return <div className="fixed inset-0 bg-[#111313]" />;
  if (!inside)
    return (
      <CrownLogin
        onDone={(w) => {
          saveWallet(w);
          setEntered(true);
        }}
      />
    );
  // Выход — в саму игру полной загрузкой, как обычный вход: новичок — выбор расы и остров,
  // на острове — остров, остальные — карта, где стоит герой (владелец 08.11).
  return <BuckwheatFrame site="link" onClose={() => window.location.assign("/chips")} />;
}
