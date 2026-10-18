/** Invalidates async route continuations without pretending to undo an in-flight step. */
export function createRouteLifetime() {
  let mounted = false;
  let epoch = 0;
  let busy = false;
  return {
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      epoch++;
    },
    cancel() {
      epoch++;
    },
    begin() {
      if (!mounted || busy) return null;
      busy = true;
      return epoch;
    },
    valid(token: number) {
      return mounted && token === epoch;
    },
    finish() {
      busy = false;
    },
    get mounted() {
      return mounted;
    },
  };
}
