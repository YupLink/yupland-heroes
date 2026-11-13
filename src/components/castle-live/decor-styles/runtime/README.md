# Five decor styles — admin editor integration

30 approved objects and 105 optimized WebP assets (3,252,212 bytes). Separate normal/flipped cast shadows keep the light direction fixed. Ground/wall/path styles are selected independently.

## Audience
New styles require the existing session.isAdmin flag. The existing base-decor gate (isAdmin || isCastleEditor) is unchanged. Non-admin views fall back to the base territory/path and exclude themed items; editing preserves their hidden saved data. No backend role, entitlement, purchase, economy or database changes.

## Persistence and compatibility
The current main localStorage save contract is preserved; roadStyle and territoryStyle are serialized alongside existing layout data. Unknown style IDs fall back to base. No claim of cross-device or paid-account synchronization. Newer account-view and bank/auction/casino behavior in the touched main components is retained.

## Validation
- Run `node scripts/check-castle-decor.cjs`: 52 assertions across all five styles, 30 mirrored objects, save/reload, old-layout fallback, role filtering and hidden-data preservation.
- Focused strict TypeScript: no diagnostics in changed files.
- Shared preview design:app-check: 23 tests, types and build passed.
- Production candidate editor/viewport rendered in an isolated fixture on the shared server: wide 1100x900 and narrow 390x844; all five territories/roads inspected, placement/reflection/save/reload and admin/editor/player UI checked.
- The review frame substitutes session, server-added buildings, account-view query and loading shell; it uses its own storage keys. It does not verify live API/account behavior or the entire production application build.

Not deployed. Paid-player access and live-account acceptance remain pending.
