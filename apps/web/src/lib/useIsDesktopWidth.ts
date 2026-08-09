import { useEffect, useState } from "react";

// 880px matches apps/desktop's Electron main window `minWidth` (see
// apps/desktop/electron/windows.ts) — the three-pane layout (desktop design
// plan §4.1) kicks in at that width whether it's the Electron shell or just
// a wide browser window (deliberately responsive-by-width, not
// platform-gated, since apps/desktop only ever loads this same apps/web
// build — see build plan §1 "desktop is a thin wrapper, not a parallel app").
const DESKTOP_BREAKPOINT = "(min-width: 880px)";

export function useIsDesktopWidth(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_BREAKPOINT).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_BREAKPOINT);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
