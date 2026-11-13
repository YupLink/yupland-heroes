// Таймер сверки индексатора: раз в 10 минут, один процесс на всех (аренда
// chain_recon_lease, чужой берёт после 15 минут тишины). Отдельно от цикла опроса —
// иначе застрявший опрос молча остановил бы и сверку, и тревогу «индексатор молчит».
import { mcpExec } from "@/server/db/mcpClient";
import { leaseSql } from "./chain-sql";

export const RECON_EVERY_MS = 10 * 60_000;
const me = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
let started = false;

type Watch = () => Promise<{ accounts: string[]; nftContracts: string[] }>;

async function tick(watch: Watch): Promise<void> {
  const rows = (await mcpExec(leaseSql(me, "chain_recon_lease", "15 minutes"), {
    wrapJson: false,
  }).catch(() => [])) as unknown[];
  if (!rows.length) return;
  const { runRecon } = await import("./recon");
  const w = await watch();
  await runRecon(w.accounts, w.nftContracts);
}

export function startReconTimer(watch: Watch): void {
  if (started) return;
  started = true;
  const go = () =>
    void tick(watch).catch((e) =>
      console.warn("[chain-recon] прогон:", e instanceof Error ? e.message : e),
    );
  setTimeout(go, 60_000);
  setInterval(go, RECON_EVERY_MS);
}
