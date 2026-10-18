// YupLink Wallet · Docs для интеграторов.
// Публичная страница с описанием redirect-flow для dApp'ов.

import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Code as CodeIcon, KeyRound, FileSignature, Mail, Plug, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/wallet/docs")({
  head: () => ({
    meta: [
      { title: "Wallet Docs — YupLink" },
      {
        name: "description",
        content:
          "Документация для интеграторов: как dApp'у подключить YupLink Wallet через redirect-flow",
      },
    ],
  }),
  component: WalletDocsPage,
});

const ORIGIN_PLACEHOLDER = "https://service.yupland.io";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-auto rounded-lg border border-border bg-secondary/30 p-3 text-[11px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Param({
  name,
  required,
  desc,
}: {
  name: string;
  required?: boolean;
  desc: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-xs">
      <div className="flex items-center gap-1.5">
        <code className="font-mono text-gold">{name}</code>
        {required ? (
          <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-[9px] uppercase text-destructive">
            required
          </span>
        ) : (
          <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
            optional
          </span>
        )}
      </div>
      <div className="mt-1 text-muted-foreground">{desc}</div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-display text-lg font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function WalletDocsPage() {
  const t = useT();
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-20 pt-4 md:px-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <CodeIcon className="h-5 w-5 text-gold" />
            <h1 className="font-display text-2xl font-bold">
              YupLink Wallet · Docs
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.intro_before_adapter")}{" "}
            <a
              href="https://github.com/miplix/yuplink-wallet-adapter"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-gold underline"
            >
              wallet-selector adapter
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            {t("wdocs.intro_after_adapter")}
          </p>
        </header>

        {/* Quick start */}
        <Section
          icon={<Plug className="h-4 w-4 text-gold" />}
          title="Quick start"
        >
          <p className="text-xs text-muted-foreground">{t("wdocs.install_from_github")}</p>
          <Code>{`npm i github:miplix/yuplink-wallet-adapter @near-wallet-selector/core`}</Code>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.usage_dropin")}
          </p>
          <Code>{`import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupYupLink } from "@miplix/yuplink-wallet-adapter";

const selector = await setupWalletSelector({
  network: "mainnet",
  modules: [
    setupYupLink({ appName: "My dApp", iconUrl: "https://my.dapp/icon.png" }),
    // ... другие кошельки
  ],
});`}</Code>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.without_adapter")}
          </p>
        </Section>

        {/* Connect */}
        <Section
          icon={<KeyRound className="h-4 w-4 text-gold" />}
          title={t("wdocs.section_connect_title")}
        >
          <p className="text-xs text-muted-foreground">
            Endpoint:{" "}
            <code className="rounded bg-secondary/40 px-1.5 py-0.5 font-mono">
              {ORIGIN_PLACEHOLDER}/wallet/connect
            </code>
          </p>
          <div className="space-y-1.5">
            <Param
              name="success_url"
              required
              desc={t("wdocs.param_success_url")}
            />
            <Param
              name="failure_url"
              required
              desc={t("wdocs.param_failure_url")}
            />
            <Param
              name="public_key"
              required
              desc={
                <>
                  {t("wdocs.param_public_key_before")}{" "}
                  <code className="font-mono">ed25519:&lt;base58&gt;</code>.
                  {" "}{t("wdocs.param_public_key_after")}
                </>
              }
            />
            <Param
              name="contract_id"
              desc={t("wdocs.param_contract_id")}
            />
            <Param
              name="methods"
              desc={t("wdocs.param_methods")}
            />
            <Param
              name="allowance"
              desc={t("wdocs.param_allowance")}
            />
            <Param
              name="app_name"
              desc={t("wdocs.param_app_name")}
            />
            <Param
              name="app_icon"
              desc={t("wdocs.param_app_icon")}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("wdocs.after_approve_redirect_before")}{" "}
            <code className="font-mono">success_url</code>{" "}
            {t("wdocs.after_approve_redirect_after")}
          </p>
          <Code>{`account_id=alice.near
public_key=ed25519:<base58>
all_keys=ed25519:<base58>
transactionHashes=<AddKey-tx-hash>`}</Code>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.on_reject_before")} <code className="font-mono">failure_url</code>{" "}
            {t("wdocs.on_reject_mid")}{" "}
            <code className="font-mono">errorCode=userRejected</code>.
          </p>
        </Section>

        {/* Sign tx */}
        <Section
          icon={<FileSignature className="h-4 w-4 text-gold" />}
          title="2. Sign Transaction"
        >
          <p className="text-xs text-muted-foreground">
            Endpoint:{" "}
            <code className="rounded bg-secondary/40 px-1.5 py-0.5 font-mono">
              {ORIGIN_PLACEHOLDER}/wallet/sign
            </code>
          </p>
          <div className="space-y-1.5">
            <Param
              name="transactions"
              required
              desc={t("wdocs.param_transactions")}
            />
            <Param
              name="callbackUrl"
              required
              desc={t("wdocs.param_callback_url_tx")}
            />
            <Param name="meta" desc={t("wdocs.param_meta")} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.array_format")}
          </p>
          <Code>{`[
  {
    "signerId": "alice.near",
    "receiverId": "v2.ref-finance.near",
    "actions": [
      {
        "type": "FunctionCall",
        "params": {
          "methodName": "ft_transfer",
          "args": { "receiver_id": "bob.near", "amount": "1000000" },
          "gas": "30000000000000",
          "deposit": "1"
        }
      },
      {
        "type": "Transfer",
        "params": { "deposit": "1000000000000000000000000" }
      }
    ]
  }
]`}</Code>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.on_success_callback_gets")}{" "}
            <code className="font-mono">transactionHashes=h1,h2&meta=...</code>
          </p>
        </Section>

        {/* Sign message */}
        <Section
          icon={<Mail className="h-4 w-4 text-gold" />}
          title="3. Sign Message (NEP-413)"
        >
          <p className="text-xs text-muted-foreground">
            Endpoint:{" "}
            <code className="rounded bg-secondary/40 px-1.5 py-0.5 font-mono">
              {ORIGIN_PLACEHOLDER}/wallet/sign-message
            </code>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.sign_message_desc")}{" "}
            <a
              href="https://github.com/near/NEPs/blob/master/neps/nep-0413.md"
              target="_blank"
              rel="noreferrer"
              className="text-gold underline"
            >
              NEP-413
            </a>
          </p>
          <div className="space-y-1.5">
            <Param
              name="message"
              required
              desc={t("wdocs.param_message")}
            />
            <Param
              name="recipient"
              required
              desc={t("wdocs.param_recipient")}
            />
            <Param
              name="nonce"
              required
              desc={t("wdocs.param_nonce")}
            />
            <Param name="callbackUrl" required desc={t("wdocs.param_callback_url")} />
            <Param name="state" desc={t("wdocs.param_state")} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.on_success_callback_gets_colon")}
          </p>
          <Code>{`accountId=alice.near
publicKey=ed25519:<base58>
signature=<base64-64bytes>
state=<твой state>`}</Code>
          <p className="text-xs text-muted-foreground">
            {t("wdocs.verify_signature_before")}{" "}
            <code className="font-mono">
              ed25519.verify(signature, sha256(borsh(payload)), publicKey)
            </code>
            {t("wdocs.verify_signature_mid")}{" "}
            <code className="font-mono">
              {"{ tag: 2147484061, message, nonce, recipient, callbackUrl: null }"}
            </code>
            .
          </p>
        </Section>

        {/* Security */}
        <Section
          icon={<Plug className="h-4 w-4 text-gold" />}
          title={t("wdocs.section_security_title")}
        >
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>
              {t("wdocs.security_item_1")}
            </li>
            <li>
              · {t("wdocs.security_item_2_before")} <b>FCAK</b>{" "}
              {t("wdocs.security_item_2_after")}
            </li>
            <li>
              · {t("wdocs.security_item_3_before")}{" "}
              <code className="font-mono">/wallet</code> → {t("wdocs.security_item_3_after")}
            </li>
            <li>
              · {t("wdocs.security_item_4_before")} <code className="font-mono">success_url</code>
              {t("wdocs.security_item_4_after")}
            </li>
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}
