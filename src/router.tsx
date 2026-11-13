import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { AppErrorScreen } from "./components/AppErrorScreen";
import { getCspNonce } from "./lib/csp/cspNonce";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: AppErrorScreen,
    // Метка ответа для встроенных скриптов (защитный заголовок, lib/csp).
    ssr: { nonce: getCspNonce() },
  });

  return router;
};
