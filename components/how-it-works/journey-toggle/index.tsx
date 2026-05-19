"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import styles from "./journey-toggle.module.scss";

export type Journey = "buyer" | "teacher";

const ORDER: Journey[] = ["buyer", "teacher"];

interface JourneyToggleProps {
  value: Journey;
  onChange: (next: Journey) => void;
  labels: { buyer: string; teacher: string };
  ariaLabel: string;
  /** Skip the sliding-indicator layout animation. */
  reduceMotion?: boolean;
}

/**
 * Pill tablist that switches the active journey. Follows the WAI-ARIA
 * tabs pattern: `role="tablist"` + `role="tab"`, `aria-selected`,
 * roving `tabindex`, and Arrow/Home/End keyboard navigation with
 * automatic activation (focus = select). The sliding background is a
 * single Framer `layoutId` element so it animates between tabs.
 */
export function JourneyToggle({
  value,
  onChange,
  labels,
  ariaLabel,
  reduceMotion = false,
}: JourneyToggleProps) {
  const tabRefs = useRef<Record<Journey, HTMLButtonElement | null>>({
    buyer: null,
    teacher: null,
  });

  const focusAndSelect = (next: Journey) => {
    onChange(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, current: Journey) => {
    const idx = ORDER.indexOf(current);
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(ORDER[(idx + 1) % ORDER.length]);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(ORDER[(idx - 1 + ORDER.length) % ORDER.length]);
        break;
      case "Home":
        e.preventDefault();
        focusAndSelect(ORDER[0]);
        break;
      case "End":
        e.preventDefault();
        focusAndSelect(ORDER[ORDER.length - 1]);
        break;
    }
  };

  return (
    <div className={styles.track} role="tablist" aria-label={ariaLabel}>
      {ORDER.map((id) => {
        const selected = value === id;
        return (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`hiw-tab-${id}`}
            aria-selected={selected}
            aria-controls={`hiw-panel-${id}`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(id)}
            onKeyDown={(e) => onKeyDown(e, id)}
          >
            {selected && (
              <motion.span
                layoutId="hiwJourneyIndicator"
                className={styles.indicator}
                aria-hidden="true"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 320, damping: 30 }
                }
              />
            )}
            <span className={styles.label}>
              {id === "buyer" ? labels.buyer : labels.teacher}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default JourneyToggle;
