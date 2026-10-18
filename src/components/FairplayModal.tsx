// Одноразовое полноэкранное окно «Спасибо за честную игру» для тех, кто НЕ
// абузил (список — settings fairplay:eligible:<wallet>, роздано 5 Football +
// 5 Retro паков). Показывается один раз; «Забрать бонус» помечает seen и ведёт
// на страницу «Фишки», где паки ждут открытия.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getFairplayBonus, ackFairplayBonus } from "@/server/api/user-auth";
import { useT } from "@/lib/i18n";

const COLORS = [
  "#FFD54A",
  "#FF8A3D",
  "#2DD4BF",
  "#A78BFA",
  "#F472B6",
  "#34D399",
  "#60A5FA",
  "#FFFFFF",
];

export function FairplayModal() {
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["fairplay-bonus"],
    queryFn: () => getFairplayBonus(),
    staleTime: 60_000,
  });
  const ack = useMutation({
    mutationFn: () => ackFairplayBonus(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fairplay-bonus"] }),
  });

  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 6 + Math.random() * 9,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.4,
        duration: 2 + Math.random() * 1.6,
        drift: (Math.random() - 0.5) * 240,
        rotate: (Math.random() - 0.5) * 900,
      })),
    []
  );

  const show = !!data?.show && !dismissed;
  if (typeof document === "undefined" || !show) return null;

  function claim() {
    setDismissed(true);
    ack.mutate();
    nav({ to: "/chips" });
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[400] flex items-center justify-center overflow-hidden bg-black/75 p-6 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {pieces.map((p) => (
          <motion.div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.left}%`,
              top: -24,
              width: p.size,
              height: p.size * 0.6,
              background: p.color,
              borderRadius: 2,
            }}
            initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
            animate={{
              y: 1000,
              x: p.drift,
              rotate: p.rotate,
              opacity: [1, 1, 0.9, 0],
            }}
            transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          />
        ))}

        <motion.div
          className="pointer-events-auto relative w-[min(92vw,420px)] rounded-3xl border border-border bg-card/95 p-8 text-center shadow-2xl backdrop-blur-xl"
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full gradient-gold shadow-gold">
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#20160a"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" />
              <path d="M17 5h2.5a1.5 1.5 0 0 1 0 5H17M7 5H4.5a1.5 1.5 0 0 0 0 5H7" />
            </svg>
          </div>

          <h2 className="mt-4 font-display text-3xl font-black text-gradient-gold">
            {t("fairplay.title")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("fairplay.subtitle")}
          </p>

          <div className="mt-5 flex items-center justify-center gap-3">
            <div className="flex flex-1 flex-col items-center gap-1 rounded-2xl border border-gold/25 bg-gold/5 py-3">
              <span className="font-display text-2xl font-black text-gold">×5</span>
              <span className="text-xs text-muted-foreground">Football</span>
            </div>
            <div className="flex flex-1 flex-col items-center gap-1 rounded-2xl border border-neon/25 bg-neon/5 py-3">
              <span className="font-display text-2xl font-black text-neon">×5</span>
              <span className="text-xs text-muted-foreground">Retro</span>
            </div>
          </div>

          <button
            type="button"
            onClick={claim}
            className="mt-7 w-full rounded-xl gradient-gold py-3.5 font-display text-base font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] active:scale-[0.99]"
          >
            {t("fairplay.claim")}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
