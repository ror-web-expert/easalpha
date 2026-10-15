import { cn } from "@/lib/utils";

/** Fades a block in the first time it scrolls into view. The element is server-rendered with data-reveal; one
 *  RevealObserver (mounted by SiteShell) adds "shown" when it intersects. The hidden start state only applies where
 *  scripting is enabled (globals.css), so crawlers and no-script browsers see everything, and nothing here hydrates. */
export function Reveal({ children, className, delay = 0, as = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" }) {
  const Tag = as;
  return (
    <Tag data-reveal="" style={delay ? { transitionDelay: `${delay}ms` } : undefined} className={cn("reveal", className)}>
      {children}
    </Tag>
  );
}
