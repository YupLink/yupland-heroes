// Счётчик живых аукционов — тот же вид, что у счётчика лагеря на карте
// (drawPlayerCount: тёмный круг, обводка #ff5470, белая цифра). Родитель — relative.
export function AuctionCount({ n }: { n: number }) {
  if (!(n > 0)) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -right-1.5 -top-1.5 z-[1] grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#ff5470] bg-[rgba(10,13,19,0.92)] px-1 font-sans text-[11px] font-bold leading-none text-white"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
