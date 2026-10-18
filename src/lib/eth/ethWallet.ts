// Подключение Ethereum-кошелька в браузере: встроенный кошелёк (MetaMask на компьютере,
// браузер внутри кошелька) или WalletConnect — с телефона и из Telegram: открывается
// приложение кошелька, игрок подтверждает и возвращается.
//
// WalletConnect грузится в браузере в момент нажатия — с esm.sh, а не из нашей сборки:
// в сборке его граф зависимостей валил серверный этап по памяти (17.10.2026), а игроку
// эти ~700 КБ нужны только здесь. Project ID WalletConnect (Reown) публичный по замыслу.
export const WC_PROJECT_ID = "b5a97aeeb45dc199a26cd73c2c62f265";
const WC_URL = "https://esm.sh/@walletconnect/ethereum-provider@2.26.0";

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
type WcProvider = Eip1193 & { connect(): Promise<void>; disconnect?: () => Promise<void> };
type WcModule = { EthereumProvider: { init(opts: Record<string, unknown>): Promise<WcProvider> } };

const hexOf = (s: string) =>
  `0x${Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("")}`;

function injected(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

async function walletConnect(): Promise<WcProvider> {
  const { EthereumProvider } = (await import(/* @vite-ignore */ WC_URL)) as WcModule;
  const provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    optionalChains: [1],
    showQrModal: true,
    optionalMethods: ["personal_sign", "eth_accounts", "eth_requestAccounts"],
    metadata: {
      name: "YupLink",
      description: "YupLink",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
  });
  await provider.connect();
  return provider;
}

/** Подключить кошелёк и подписать сообщение. Отдаёт адрес и подпись. */
export async function connectAndSign(
  getMessage: () => Promise<string>,
): Promise<{ address: string; signature: string }> {
  const provider: Eip1193 & { disconnect?: () => Promise<void> } =
    injected() ?? (await walletConnect());
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = String(accounts?.[0] ?? "").toLowerCase();
  if (!address) throw new Error("Кошелёк не отдал адрес");
  const message = await getMessage();
  const signature = (await provider.request({
    method: "personal_sign",
    params: [hexOf(message), address],
  })) as string;
  if (provider.disconnect) void provider.disconnect().catch(() => {});
  return { address, signature };
}
