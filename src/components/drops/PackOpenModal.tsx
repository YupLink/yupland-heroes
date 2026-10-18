import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { myPackInventory, openPack } from "@/server/api/packs";
import { toast } from "sonner";
import { Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { fmtClaim } from "./shop-shared";
import { humanError } from "@/lib/humanError";

type PackInvItem = Awaited<ReturnType<typeof myPackInventory>>[number];

export function PackOpenModal({
  inventoryId,
  pack,
  onClose,
}: {
  inventoryId: string;
  pack: PackInvItem | null;
  onClose: () => void;
}) {
  const t = useT();
  const [phase, setPhase] = useState<"idle" | "rolling" | "reveal">("idle");
  const [result, setResult] = useState<{
    kind: "nft" | "ft" | "molodec";
    nftTitle?: string;
    nftImage?: string | null;
    token?: string;
    amount?: number;
  } | null>(null);

  const open = useMutation({
    mutationFn: () => openPack({ data: { inventoryId } }),
    onSuccess: (res) => {
      setResult(res.result);
      setTimeout(() => setPhase("reveal"), 1600);
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      onClose();
    },
  });

  const start = () => {
    setPhase("rolling");
    open.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={() => {
        if (phase === "idle" || phase === "reveal") onClose();
      }}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-neon/40 bg-card shadow-[0_0_60px_rgba(56,189,248,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        {(phase === "idle" || phase === "reveal") && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {phase === "idle" && (
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            <div className="relative aspect-square h-40 w-40 overflow-hidden rounded-2xl border border-neon/30 bg-secondary/40">
              {pack?.packImage ? (
                <img
                  src={pack.packImage}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Package className="h-12 w-12" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold">
                {pack?.packName ?? t("mynfts.pack_word")}
              </h3>
              {pack?.packDescription && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {pack.packDescription}
                </p>
              )}
            </div>
            {/* Приз определяется в момент открытия — предупреждаем до нажатия,
                иначе «Открыть!» читается как безобидный шаг просмотра. */}
            <div className="w-full rounded-xl border border-gold/30 bg-gold/5 p-3 text-left text-[13px] leading-snug text-muted-foreground">
              {t("mynfts.open_confirm_warn")}
            </div>
            <div className="flex w-full items-center gap-2">
              <button
                onClick={onClose}
                disabled={open.isPending}
                className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={start}
                disabled={open.isPending}
                className="flex-[2] rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50"
              >
                {t("mynfts.open_bang")}
              </button>
            </div>
          </div>
        )}

        {phase === "rolling" && (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="relative aspect-square h-40 w-40 overflow-hidden rounded-2xl border border-neon/40 bg-secondary/40">
              {pack?.packImage ? (
                <img
                  src={pack.packImage}
                  alt=""
                  className="h-full w-full animate-pulse object-cover"
                />
              ) : (
                <Package className="h-12 w-12 animate-pulse text-neon" />
              )}
              <div className="absolute inset-0 animate-pulse bg-neon/10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-black/60 px-3 py-1.5 text-2xl font-mono text-neon shadow-[0_0_20px_rgba(56,189,248,0.7)]">
                  <span className="animate-bounce inline-block">?</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {t("mynfts.opening")}
            </div>
          </div>
        )}

        {phase === "reveal" && result && (
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            <div
              className={cn(
                "relative aspect-square h-40 w-40 overflow-hidden rounded-2xl border-2",
                result.kind === "nft" &&
                  "border-neon/60 bg-neon/10 shadow-[0_0_30px_rgba(56,189,248,0.5)]",
                result.kind === "ft" &&
                  "border-gold/60 bg-gold/10 shadow-gold",
                result.kind === "molodec" &&
                  "border-gold/50 bg-gold/10 shadow-[0_0_40px_rgba(212,175,55,0.45)] animate-pulse"
              )}
            >
              <div className="flex h-full items-center justify-center">
                {result.kind === "nft" ? (
                  result.nftImage ? (
                    <img
                      src={result.nftImage}
                      alt={result.nftTitle ?? "NFT"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-6xl">🖼</div>
                  )
                ) : result.kind === "ft" ? (
                  <div className="text-6xl">💰</div>
                ) : (
                  <>
                    <div className="text-7xl animate-bounce">🎉</div>
                    {[
                      { e: "🎊", x: -60, y: -60, d: "0ms" },
                      { e: "✨", x: 60, y: -60, d: "100ms" },
                      { e: "⭐", x: -60, y: 60, d: "200ms" },
                      { e: "🎉", x: 60, y: 60, d: "150ms" },
                      { e: "💫", x: 0, y: -75, d: "50ms" },
                      { e: "✨", x: 0, y: 75, d: "250ms" },
                      { e: "⭐", x: -75, y: 0, d: "180ms" },
                      { e: "🎊", x: 75, y: 0, d: "120ms" },
                    ].map((p, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 top-1/2 text-2xl"
                        style={{
                          animation: `confetti 1.4s ease-out ${p.d} infinite`,
                          ["--cx" as string]: `${p.x}px`,
                          ["--cy" as string]: `${p.y}px`,
                        }}
                      >
                        {p.e}
                      </span>
                    ))}
                    <style>{`
                      @keyframes confetti {
                        0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
                        30% { opacity: 1; }
                        100% { transform: translate(calc(-50% + var(--cx)), calc(-50% + var(--cy))) scale(1) rotate(360deg); opacity: 0; }
                      }
                    `}</style>
                  </>
                )}
              </div>
            </div>
            <div>
              {result.kind === "nft" && (
                <>
                  <div className="text-[11px] uppercase tracking-widest text-neon">
                    NFT
                  </div>
                  <h3 className="mt-0.5 font-display text-xl font-bold">
                    {result.nftTitle}
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("mynfts.reveal_nft_hint")}
                  </p>
                </>
              )}
              {result.kind === "ft" && (
                <>
                  <div className="text-[11px] uppercase tracking-widest text-gold">
                    {t("mynfts.reward")}
                  </div>
                  <h3 className="mt-0.5 font-display text-2xl font-bold text-gradient-gold">
                    {fmtClaim(result.amount)} {result.token}
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("mynfts.reveal_ft_hint")}
                  </p>
                </>
              )}
              {result.kind === "molodec" && (
                <>
                  <div className="text-[11px] uppercase tracking-widest text-gold">
                    🎊 {t("mynfts.congrats")}
                  </div>
                  <h3 className="mt-0.5 font-display text-2xl font-bold text-gradient-gold">
                    {t("mynfts.molodec")}!
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("mynfts.molodec_reveal_hint")}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold"
            >
              {t("mynfts.great")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
