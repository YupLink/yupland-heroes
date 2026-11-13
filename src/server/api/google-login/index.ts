// Вход через Google — серверные функции (вход для всех — выключатель в /admin/google).
export { getGoogleLoginConfig, loginWithGoogle } from "./googleLogin";
export {
  adminGoogleOverview,
  adminSetGoogleClientId,
  adminSetGoogleDeviceLimit,
  adminSetGoogleOpen,
} from "./googleAdmin";
export { getGoogleLink, linkGoogle } from "./googleLink";
