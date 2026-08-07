/** Tiny classNames joiner — deliberately not pulling in `clsx`/`tailwind-merge`
 * for a handful of components; swap in `tailwind-merge` if class conflicts
 * become a real problem as the component set grows. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
