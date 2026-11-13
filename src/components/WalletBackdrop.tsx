// Фон кошелька (вынесен из WalletHome.tsx — файл перерос 250 строк).
/** Фон: глубокий тёмный + мягкие золотые свечения. */
export function WalletBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(closest-side, oklch(0.83 0.16 88 / 0.55), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-48 -right-32 h-96 w-96 rounded-full opacity-15 blur-3xl"
        style={{
          background: "radial-gradient(closest-side, oklch(0.86 0.13 200 / 0.5), transparent)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-25" />
      {children}
    </div>
  );
}
