// Фанфары: салют из конфетти + «Молодец!» по центру. Запускается, когда
// у юзера выпал «Молодец» (погашение без приза). Без новых зависимостей —
// на framer-motion. Перерисовывается по смене ключа `trigger`.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

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

type Piece = {
  id: string;
  left: number; // %
  size: number; // px
  color: string;
  delay: number; // s
  duration: number; // s
  drift: number; // px по горизонтали
  rotate: number; // deg
  fall: number; // px вниз
};

export function Fanfare({ trigger }: { trigger: number }) {
  const [show, setShow] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const H =
      typeof window !== "undefined" ? window.innerHeight : 800;
    const arr: Piece[] = Array.from({ length: 80 }, (_, i) => ({
      id: `${trigger}-${i}`,
      left: Math.random() * 100,
      size: 6 + Math.random() * 9,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.5,
      duration: 2 + Math.random() * 1.6,
      drift: (Math.random() - 0.5) * 240,
      rotate: (Math.random() - 0.5) * 900,
      fall: H + 100,
    }));
    setPieces(arr);
    setShow(true);
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, [trigger]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[300] overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
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
                y: p.fall,
                x: p.drift,
                rotate: p.rotate,
                opacity: [1, 1, 0.9, 0],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: "easeIn",
              }}
            />
          ))}

          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{
              scale: [0.3, 1.18, 1, 1, 0.95],
              opacity: [0, 1, 1, 1, 0],
            }}
            transition={{ duration: 2.6, times: [0, 0.18, 0.3, 0.82, 1] }}
          >
            <div className="text-center">
              <div className="text-6xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                🎉
              </div>
              <div className="mt-2 font-display text-4xl font-black text-gradient-gold drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                Молодец!
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
