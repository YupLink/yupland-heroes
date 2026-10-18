// Ethereum-кошелёк и герои за NFT Heroes of Valdir — в ленте Казны, под Solana.
// Пока только админам (владелец, 17.10.2026): остальным блок не показывается вовсе.
import { useState } from "react";
import { Wallet, Check, Crown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";
import { getSession } from "@/server/api/user-auth";
import { ethNonce, ethAttach, ethUnlink, ethHovStatus, ethHovClaim } from "@/server/api/eth";
import { connectAndSign } from "@/lib/eth/ethWallet";

const KEY = ["eth-hov-status"];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const RARITY = {
  legendary: ["легендарный", "legendary"],
  epic: ["эпический", "epic"],
  rare: ["редкий", "rare"],
} as const;

export function TreasuryEthConnection() {
  const en = useLang() === "en";
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const admin = (session.data as { isAdmin?: boolean } | undefined)?.isAdmin === true;
  const status = useQuery({ queryKey: KEY, queryFn: () => ethHovStatus(), enabled: admin });
  const [got, setGot] = useState<{ name: string; rarity: keyof typeof RARITY; what: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });

  const link = useMutation({
    mutationFn: async () => {
      const { address, signature } = await connectAndSign(async () => (await ethNonce()).message);
      await ethAttach({ data: { address, signature } });
    },
    onSuccess: refresh,
  });
  const unlink = useMutation({ mutationFn: () => ethUnlink(), onSuccess: refresh });
  const claim = useMutation({
    mutationFn: (tokenId: number) => ethHovClaim({ data: { tokenId } }),
    onSuccess: (r) => {
      setGot({ name: r.name, rarity: r.rarity, what: `${r.race} · ${r.spec}` });
      refresh();
      invalidateHeroQueries(qc);
    },
  });

  if (!admin) return null;
  const addr = status.data?.address ?? null;
  const err = link.error ?? unlink.error ?? claim.error;

  if (!addr) {
    return (
      <>
        <button
          data-game-button="primary"
          type="button"
          className="castle-profile__wallet-cta inline-flex w-full items-center justify-center gap-2"
          disabled={link.isPending}
          onClick={() => link.mutate()}
        >
          <Wallet aria-hidden="true" className="h-4 w-4" />
          {link.isPending ? (en ? "Connecting…" : "Подключение…") : en ? "Connect Ethereum" : "Привязать Ethereum"}
        </button>
        {err && <p role="alert" className="text-sm">{humanError(err)}</p>}
      </>
    );
  }

  const tokens = status.data?.tokens ?? [];
  return (
    <div className="castle-profile__wallet space-y-2 rounded-xl border border-border p-3">
      <div className="castle-profile__wallet-heading">
        <Wallet aria-hidden="true" />
        <div>
          <h3>Ethereum</h3>
          <p className="castle-profile__wallet-status castle-profile__wallet-status--connected">
            <Check aria-hidden="true" />
            {short(addr)}
          </p>
        </div>
      </div>
      <h4 className="text-sm font-semibold">Heroes of Valdir · {tokens.length}</h4>
      {got && (
        <p role="status" className="text-sm font-semibold text-gold">
          {en
            ? `Hero received: ${got.name} (${RARITY[got.rarity][1]}, ${got.what})`
            : `Получен герой: ${got.name} (${RARITY[got.rarity][0]}, ${got.what})`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tokens.map((t) => (
          <div key={t.tokenId} className="space-y-1 rounded-lg border border-border p-2 text-xs">
            {t.image && <img src={t.image} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />}
            <div className="flex items-center gap-1 font-semibold">
              {t.lirian && <Crown aria-hidden="true" className="h-3.5 w-3.5 text-gold" />}
              <span className="truncate">{t.heroName ?? "—"}</span>
            </div>
            <div className="text-muted-foreground">#{t.tokenId}</div>
            <button
              type="button"
              data-game-button={t.claimed ? "secondary" : "primary"}
              className="min-h-9 w-full"
              disabled={t.claimed || claim.isPending}
              onClick={() => claim.mutate(t.tokenId)}
            >
              {t.claimed ? (en ? "Received" : "Получено") : en ? "Get hero" : "Забрать героя"}
            </button>
          </div>
        ))}
      </div>
      <button
        data-game-button="secondary"
        className="min-h-11 w-full rounded-xl"
        disabled={unlink.isPending}
        onClick={() => unlink.mutate()}
      >
        {en ? "Disconnect Ethereum" : "Отвязать Ethereum"}
      </button>
      {err && <p role="alert" className="text-sm">{humanError(err)}</p>}
    </div>
  );
}
