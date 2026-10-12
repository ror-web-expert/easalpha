// Tells an open screen that a new build was deployed. Pure parts here so they are unit-tested; the hook is in
// components/update-notice.tsx.

export const UPDATE_POLL_MS = 5 * 60_000;

/** Display-only screens reload on their own: nobody is typing on a kitchen, token or queue screen. */
export function reloadsSilently(pathname: string): boolean {
  return /^\/(kitchen|token|queue)(\/|$)/.test(pathname);
}

/** A change of build id after the first successful check means a deploy happened. */
export function buildChanged(first: string | null, latest: string | null): boolean {
  return !!first && !!latest && first !== latest && latest !== "dev";
}
