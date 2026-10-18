// Relay для YupLink Wallet — мост для cross-device connect/sign-flow,
// аналог h4n.app у HOT. dApp создаёт запрос → открывает Telegram mini-app
// у юзера → юзер подписывает локальным embedded-кошельком → результат
// возвращается dApp'у поллингом. Так dApp может быть в десктоп-браузере,
// а кошелёк — в TG mini-app на телефоне, как у HOT.
//
// Хранилище — yuplink.settings (TTL 10 мин), без отдельной таблицы.
// CORS открыт для всех (для внешних dApp'ов).

import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { pg } from "@/server/db/pg";

const RELAY_TTL_MS = 10 * 60 * 1000;

type RelayRequest = {
  // что приходит от dApp:
  publicKey: string;
  contractId: string | null;
  methods: string[];
  allowanceYocto: string | null;
  appName: string;
  appIcon: string | null;
  successUrl: string | null;
  // состояние и ответ:
  status: "pending" | "approved" | "rejected" | "expired";
  response: {
    accountId: string;
    publicKey: string;
    transactionHashes: string;
  } | null;
  createdAt: number;
  expiresAt: number;
};

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  };
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}
function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

async function loadRelay(id: string): Promise<RelayRequest | null> {
  const row = await pg.settings.findOne({ key: `relay:${id}` });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as RelayRequest;
  } catch {
    return null;
  }
}
async function saveRelay(id: string, req: RelayRequest): Promise<void> {
  await pg.settings.upsert(
    { key: `relay:${id}`, value: JSON.stringify(req) },
    { onConflict: "key" }
  );
}

export const Route = createFileRoute("/api/wallet-relay")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),

      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return err("body должен быть JSON");
        }
        const action = body.action;

        // ─── create: dApp создаёт запрос ───
        if (action === "create") {
          const publicKey = String(body.publicKey ?? "");
          if (!publicKey || !/^ed25519:/.test(publicKey)) {
            return err("publicKey должен начинаться с ed25519:");
          }
          const id = nanoid(16);
          const now = Date.now();
          const req: RelayRequest = {
            publicKey,
            contractId: (body.contractId as string | null) ?? null,
            methods: Array.isArray(body.methods)
              ? (body.methods as string[]).filter(
                  (s) => typeof s === "string"
                )
              : [],
            allowanceYocto: (body.allowanceYocto as string | null) ?? null,
            appName: String(body.appName ?? "Внешний dApp").slice(0, 200),
            appIcon: (body.appIcon as string | null) ?? null,
            successUrl: (body.successUrl as string | null) ?? null,
            status: "pending",
            response: null,
            createdAt: now,
            expiresAt: now + RELAY_TTL_MS,
          };
          await saveRelay(id, req);
          return ok({
            requestId: id,
            expiresAt: req.expiresAt,
            walletUrl: `/wallet/connect?relay=${id}`,
          });
        }

        // ─── get: страница /wallet/connect берёт исходные параметры ───
        if (action === "get") {
          const id = String(body.id ?? "");
          if (!id) return err("id обязателен");
          const req = await loadRelay(id);
          if (!req) return err("Запрос не найден", 404);
          if (Date.now() > req.expiresAt) return err("Запрос истёк", 410);
          // не возвращаем response, только параметры запроса
          return ok({
            publicKey: req.publicKey,
            contractId: req.contractId,
            methods: req.methods,
            allowanceYocto: req.allowanceYocto,
            appName: req.appName,
            appIcon: req.appIcon,
            status: req.status,
          });
        }

        // ─── respond: wallet кладёт результат ───
        if (action === "respond") {
          const id = String(body.id ?? "");
          if (!id) return err("id обязателен");
          const req = await loadRelay(id);
          if (!req) return err("Запрос не найден", 404);
          if (Date.now() > req.expiresAt) return err("Запрос истёк", 410);
          if (req.status !== "pending") return err("Уже обработан", 409);
          const status = body.status === "rejected" ? "rejected" : "approved";
          req.status = status;
          if (status === "approved") {
            const accountId = String(body.accountId ?? "");
            const publicKey = String(body.publicKey ?? "");
            const transactionHashes = String(body.transactionHashes ?? "");
            if (!accountId || !publicKey) {
              return err("accountId и publicKey обязательны");
            }
            req.response = { accountId, publicKey, transactionHashes };
          }
          await saveRelay(id, req);
          return ok({ ok: true });
        }

        // ─── poll: dApp опрашивает статус ───
        if (action === "poll") {
          const id = String(body.id ?? "");
          if (!id) return err("id обязателен");
          const req = await loadRelay(id);
          if (!req) return ok({ status: "not_found" });
          if (Date.now() > req.expiresAt) return ok({ status: "expired" });
          return ok({ status: req.status, response: req.response });
        }

        return err(`Неизвестный action: ${String(action)}`);
      },
    },
  },
});
