// YUPLINK · Админ · «Минт NFT» — как @nft_sender_yupland_bot.
// Заполняем форму → картинка грузится в /api/upload (потом сервер пиннит в
// Pinata один раз) → сервер строит nft_batch_mint actions → подписываем СВОИМ
// NEAR-кошельком (getConnector).
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, ImagePlus, Wrench } from "lucide-react";
import {
  adminBuildNftMintActions,
  type NftMintBuild,
} from "@/server/api/nftMint";
import { getConnector } from "@/lib/near-connector";

export const Route = createFileRoute("/admin/mint")({
  component: MintPage,
});

const DEFAULT_CONTRACT = "yuplandshop.mintbase1.near";
const DEFAULT_OWNER = "darai_collection.near";

/** Аплоад файла-картинки в /api/upload (admin-only), возвращает url. */
async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`upload: ${res.status} ${t}`);
  }
  const j = (await res.json()) as { url?: string; error?: string };
  if (j.error || !j.url) throw new Error(j.error ?? "upload: нет url");
  return j.url;
}

// Чистка строк от контрол-байтов по code-point (без raw-байтов в исходнике) —
// подстраховка на клиенте (сервер уже чистит), чтобы HOT-кошелёк не падал.
function isBadCp(o: number): boolean {
  return (
    o <= 0x1f ||
    o === 0x7f ||
    (o >= 0x200b && o <= 0x200f) ||
    o === 0x2028 ||
    o === 0x2029 ||
    o === 0xfeff
  );
}
function cleanString(s: string): string {
  let out = "";
  for (const ch of s) out += isBadCp(ch.codePointAt(0) ?? 0) ? " " : ch;
  return out.replace(/\s+/g, " ").trim();
}
function sanitizeDeep<T>(v: T): T {
  if (typeof v === "string") return cleanString(v) as T;
  if (Array.isArray(v)) return v.map(sanitizeDeep) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = sanitizeDeep(val);
    }
    return out as T;
  }
  return v;
}

/** Бьём массив actions на TX'ы по TX_GAS_BUDGET (как в лавке). */
function splitActionsToTxs(
  actions: Array<{ params: { gas: string } }>,
  receiverId: string,
  txGasBudget: number
): Array<{ receiverId: string; actions: typeof actions }> {
  const txs: Array<{ receiverId: string; actions: typeof actions }> = [];
  let cur: typeof actions = [];
  let curGas = 0;
  for (const a of actions) {
    const g = parseInt(a.params.gas, 10);
    if (cur.length && curGas + g > txGasBudget) {
      txs.push({ receiverId, actions: cur });
      cur = [];
      curGas = 0;
    }
    cur.push(a);
    curGas += g;
  }
  if (cur.length) txs.push({ receiverId, actions: cur });
  return txs;
}

const inputCls =
  "w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-neon/50";
const labelCls =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground";

function MintPage() {
  const [contract, setContract] = useState(DEFAULT_CONTRACT);
  const [owner, setOwner] = useState(DEFAULT_OWNER);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [count, setCount] = useState("1");
  const [royalty, setRoyalty] = useState("5");
  const [reputation, setReputation] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [minting, setMinting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const numCount = Math.max(1, Math.min(120, Math.round(Number(count) || 1)));
  const numRoyalty = Math.max(0, Math.min(50, Number(royalty) || 0));

  async function onFile(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadImage(f);
      setMediaUrl(url);
      setUrlDraft("");
      toast.success("Картинка загружена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function onMint() {
    if (!contract.trim()) return toast.error("Укажи ID контракта");
    if (!owner.trim()) return toast.error("Укажи владельца (owner_id)");
    if (!title.trim()) return toast.error("Заполни название");
    if (!description.trim()) return toast.error("Заполни описание");
    const media = mediaUrl ?? (urlDraft.trim() || null);
    if (!media) return toast.error("Загрузи изображение или вставь URL");

    const rep = reputation.trim() === "" ? null : Number(reputation.trim());
    if (rep != null && (!Number.isFinite(rep) || rep < 0)) {
      return toast.error("Репутация — целое число ≥ 0");
    }

    setMinting(true);
    try {
      const connector = await getConnector();
      if (!connector) throw new Error("NEAR-кошелёк не подключён");
      let w;
      let signerAccount = "";
      try {
        const conn = await connector.getConnectedWallet();
        w = conn.wallet;
        signerAccount = conn.accounts[0]?.accountId ?? "";
      } catch {
        throw new Error("Сессия NEAR-кошелька не активна — переподключи");
      }
      if (!signerAccount) throw new Error("Не удалось определить accountId");

      const build = (await adminBuildNftMintActions({
        data: {
          contractId: contract.trim(),
          ownerId: owner.trim(),
          title,
          description,
          mediaUrl: media,
          numToMint: numCount,
          royaltyPercent: Math.round(numRoyalty * 100), // % → basis points
          reputation: rep == null ? null : Math.round(rep),
          signerAccount,
        },
      })) as NftMintBuild;

      const cleanActions = build.actions.map((a) => sanitizeDeep(a.action));
      const txs = splitActionsToTxs(
        cleanActions,
        build.contract,
        build.txGasBudget
      );

      toast.message(`Подпиши ${txs.length} TX в кошельке…`);
      await w.signAndSendTransactions({ transactions: txs });
      toast.success(`Заминтили ${numCount} NFT → ${build.recipient}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setMinting(false);
    }
  }

  const preview = mediaUrl ?? (urlDraft.trim() || null);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neon/10 text-neon">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Минт NFT</h1>
          <p className="text-sm text-muted-foreground">
            Создать новый NFT на контракте Mintbase. Подпись — твоим кошельком
            (должен быть minter'ом контракта).
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-4">
        <div>
          <label className={labelCls}>
            ID контракта <span className="text-neon">*</span>
          </label>
          <input
            className={inputCls}
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder={DEFAULT_CONTRACT}
          />
        </div>

        <div>
          <label className={labelCls}>
            Владелец (owner_id) <span className="text-neon">*</span>
          </label>
          <input
            className={inputCls}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder={DEFAULT_OWNER}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Куда падают NFT и роялти. По умолчанию коллекция.
          </p>
        </div>

        <div>
          <label className={labelCls}>
            Название <span className="text-neon">*</span>
          </label>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Мой прекрасный NFT"
          />
        </div>

        <div>
          <label className={labelCls}>
            Описание <span className="text-neon">*</span>
          </label>
          <textarea
            className={`${inputCls} min-h-24 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опишите ваш NFT…"
          />
        </div>

        <div>
          <label className={labelCls}>
            Изображение <span className="text-neon">*</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm font-medium transition hover:border-neon/40 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              Загрузить изображение
            </button>
            <input
              className={`${inputCls} min-w-0 flex-1`}
              value={urlDraft}
              onChange={(e) => {
                setUrlDraft(e.target.value);
                setMediaUrl(null);
              }}
              placeholder="или вставьте URL"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
          {preview && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={preview}
                alt=""
                className="h-16 w-16 rounded-lg border border-border object-cover"
              />
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {preview}
              </span>
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Грузится в IPFS (Pinata) один раз и используется на весь батч.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Сколько минтить <span className="text-neon">*</span>
            </label>
            <input
              className={inputCls}
              type="number"
              min={1}
              max={120}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">1–120</p>
          </div>
          <div>
            <label className={labelCls}>Роялти (%)</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              max={50}
              value={royalty}
              onChange={(e) => setRoyalty(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">0–50</p>
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Репутация{" "}
            <span className="normal-case text-muted-foreground/60">
              необязательно
            </span>
          </label>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={reputation}
            onChange={(e) => setReputation(e.target.value)}
            placeholder="напр. 5"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Пишется в metadata.extra.Reputation (пусто → 0).
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <p className="text-[11px] text-muted-foreground">
            Депозит рассчитывается автоматически по размеру метаданных.
          </p>
          <button
            type="button"
            onClick={onMint}
            disabled={minting || uploading}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-neon/15 px-5 py-2.5 text-sm font-bold text-neon ring-1 ring-neon/40 transition hover:bg-neon/25 disabled:opacity-50"
          >
            {minting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            Минт{numCount > 1 ? ` ×${numCount}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
