// Файл прошлой сборки (server/assetArchive): сюда доходят только те /assets/*, которых
// нет в текущей сборке, — их раздаёт статика. Старая страница игрока после выката
// получает свой кусок кода, а не HTML «не найдено» (иначе «Не удалось открыть окно»).
import { createFileRoute } from "@tanstack/react-router";
import { assetType, readArchivedAsset } from "@/server/assetArchive";

export const Route = createFileRoute("/assets/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = String((params as { _splat?: string })._splat ?? "");
        const body = await readArchivedAsset(name);
        if (!body) {
          return new Response("not found", {
            status: 404,
            headers: { "content-type": "text/plain", "cache-control": "no-store" },
          });
        }
        return new Response(new Uint8Array(body), {
          status: 200,
          headers: {
            "content-type": assetType(name),
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
