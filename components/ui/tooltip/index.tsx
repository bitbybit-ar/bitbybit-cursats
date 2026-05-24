"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import styles from "./tooltip.module.scss";

interface TooltipProps {
  text: string;
  example?: string;
  label?: string;
  /** When true, the wrapper stretches full-width — use for block children like a fullWidth Button. */
  block?: boolean;
  /**
   * When true, the wrapper itself becomes a tab stop and is linked to
   * the popover via aria-describedby. Use this when wrapping content
   * that can't receive focus on its own (e.g. a disabled button), so
   * keyboard and screen-reader users can still discover the tooltip.
   * Don't use with an already-focusable child — creates a double tab
   * stop.
   */
  focusableWrapper?: boolean;
  /**
   * Optional trigger. When omitted, a "?" button is rendered. When
   * provided, these children are the trigger and the popover appears
   * when the wrapper is hovered — useful for attaching tooltips to
   * disabled controls that can't receive hover events themselves.
   */
  children?: ReactNode;
}

// Keep the popover this far from the viewport edge when nudging it
// back on-screen.
const VIEWPORT_MARGIN = 8;

export function Tooltip({
  text,
  example,
  label = "More info",
  block = false,
  focusableWrapper = false,
  children,
}: TooltipProps) {
  const id = useId();
  const popoverRef = useRef<HTMLSpanElement>(null);
  // Horizontal nudge (px) applied on top of the default centering so a
  // popover near a screen edge — e.g. a tooltip on a left-aligned label
  // on a phone — can't spill off the viewport. Recomputed each time the
  // tooltip is about to open, so it self-corrects after resize/scroll.
  const [shift, setShift] = useState(0);

  const clampIntoViewport = useCallback(() => {
    const el = popoverRef.current;
    if (!el) return;
    // The rect already reflects the current shift (it's baked into the
    // transform), so we adjust by the delta needed to clear each edge.
    const rect = el.getBoundingClientRect();
    let next = shift;
    if (rect.left < VIEWPORT_MARGIN) {
      next += VIEWPORT_MARGIN - rect.left;
    } else if (rect.right > window.innerWidth - VIEWPORT_MARGIN) {
      next -= rect.right - (window.innerWidth - VIEWPORT_MARGIN);
    }
    if (next !== shift) setShift(next);
  }, [shift]);

  return (
    <span
      className={cn(styles.wrapper, block && styles.wrapperBlock)}
      tabIndex={focusableWrapper ? 0 : undefined}
      aria-describedby={focusableWrapper ? id : undefined}
      onPointerEnter={clampIntoViewport}
      onFocus={clampIntoViewport}
    >
      {children ?? (
        <button
          type="button"
          className={styles.trigger}
          aria-label={label}
          aria-describedby={id}
        >
          ?
        </button>
      )}
      <span
        id={id}
        role="tooltip"
        ref={popoverRef}
        className={styles.popover}
        style={{ "--tooltip-shift": `${shift}px` } as CSSProperties}
      >
        <span className={styles.text}>{text}</span>
        {example && <span className={styles.example}>{example}</span>}
      </span>
    </span>
  );
}

export default Tooltip;
