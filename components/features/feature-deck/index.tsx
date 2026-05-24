"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import styles from "./feature-deck.module.scss";

type Rotation = "left" | "right" | "none";

export interface DeckSlot {
  key: string;
  /** Polaroid rotation used in the static (non-animated) branch. */
  rotation: Rotation;
  /** Pre-rendered polaroid (frame + caption). */
  children: React.ReactNode;
  /**
   * "last" defers the deal until every other card has started and
   * pins this card to the bottom of the visible stack — useful when
   * a card sits visually close to the stack origin and would
   * otherwise barely animate.
   */
  priority?: "last";
}

interface FeatureDeckProps {
  slots: readonly DeckSlot[];
}

// The board is a wrapping multi-column grid above the mobile
// breakpoint ($breakpoint-mobile, 768px) and collapses to a single
// column below it (see `.board` @include mobile). The deck deal needs
// that multi-column grid to fan into, so we run it for every
// non-mobile width — small laptops and tablets included — and fall
// back to the per-card cascade only on phones.
const DECK_MIN_PX = 768;

// Cadence — total deal time ≈ rows × ROW + (cols-1) × PER + spring
// tail. Tuned so the whole 3×3 deal completes in ~4s with the
// `priority: "last"` card deferred to the very end.
const ROW_DELAY = 0.9;
const PER_CARD_DELAY = 0.25;
// Extra wait between the last "normal" card and any "priority: last"
// card, so the deferred one is unmistakably the closer.
const LAST_GAP = 0.7;

interface PositionedSlot {
  key: string;
  x: number;
  y: number;
}

// Cluster slots into rows by Y position (10px tolerance), then sort
// each row by X. The grid is wrapping flex, so we can't infer rows
// from source order — they depend on viewport width.
function clusterRows(positions: PositionedSlot[]): PositionedSlot[][] {
  const sorted = [...positions].sort((a, b) => a.y - b.y);
  const rows: PositionedSlot[][] = [];
  let current: PositionedSlot[] = [];
  let lastY = -Infinity;
  for (const p of sorted) {
    if (p.y - lastY > 10) {
      if (current.length) rows.push(current);
      current = [p];
    } else {
      current.push(p);
    }
    lastY = p.y;
  }
  if (current.length) rows.push(current);
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

export function FeatureDeck({ slots }: FeatureDeckProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const [inView, setInView] = useState(false);
  const [offsets, setOffsets] = useState<
    Map<string, { dx: number; dy: number }>
  >(new Map());
  const [delays, setDelays] = useState<Map<string, number>>(new Map());

  const trackRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Animated mode is post-hydration only — SSR and first client paint
  // both render the static board so hydration matches.
  useEffect(() => {
    setMounted(true);
    if (reduceMotion) return;
    const mq = window.matchMedia(`(min-width: ${DECK_MIN_PX}px)`);
    setIsWide(mq.matches);
    const onChange = () => setIsWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [reduceMotion]);

  const enabled = mounted && !reduceMotion;
  const animated = enabled && isWide;
  const cascade = enabled && !isWide;

  // Use the first slot as the deck origin and measure each slot's
  // center relative to it. Runs in useLayoutEffect so positions
  // exist before the next paint — once `ready` flips true, motion.div
  // mounts with the proper `initial` offset, which is what makes the
  // card APPEAR at the deck (rather than animating to it).
  useLayoutEffect(() => {
    if (!animated) return;
    const measure = () => {
      // Use the FIRST slot as the deck origin: cards stack visually
      // at where the first card lands, then fan out to fill the
      // grid. The first card barely moves; every other card travels
      // from there to its own slot.
      const firstKey = slots[0]?.key;
      if (!firstKey) return;
      const firstSlot = slotRefs.current.get(firstKey);
      const firstRect = firstSlot?.getBoundingClientRect();
      if (!firstRect) return;
      const deckCx = firstRect.left + firstRect.width / 2;
      const deckCy = firstRect.top + firstRect.height / 2;
      const positions: PositionedSlot[] = [];
      const newOffsets = new Map<string, { dx: number; dy: number }>();
      slotRefs.current.forEach((el, key) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const slotCx = r.left + r.width / 2;
        const slotCy = r.top + r.height / 2;
        positions.push({ key, x: slotCx, y: slotCy });
        newOffsets.set(key, { dx: deckCx - slotCx, dy: deckCy - slotCy });
      });
      const rows = clusterRows(positions);
      const newDelays = new Map<string, number>();
      let maxBaseDelay = 0;
      rows.forEach((row, rowIdx) => {
        const sequence = rowIdx % 2 === 0 ? row : [...row].reverse();
        sequence.forEach((p, posIdx) => {
          const d = rowIdx * ROW_DELAY + posIdx * PER_CARD_DELAY;
          newDelays.set(p.key, d);
          if (d > maxBaseDelay) maxBaseDelay = d;
        });
      });
      // Defer any `priority: "last"` cards to after the natural last
      // card, with a visible gap so the closer reads as separate.
      slots.forEach((slot) => {
        if (slot.priority === "last") {
          newDelays.set(slot.key, maxBaseDelay + LAST_GAP);
        }
      });
      setOffsets(newOffsets);
      setDelays(newDelays);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [animated]);

  // Trigger the deal as soon as the section appears in the viewport.
  // Manual IntersectionObserver instead of useInView — that hook was
  // not firing reliably after the conditional-mount sequence the
  // measurement step needs.
  useEffect(() => {
    if (!animated) return;
    const target = trackRef.current;
    if (!target) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            return;
          }
        }
      },
      { threshold: 0.15 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [animated]);

  // Static branch — SSR, first client paint, reduced-motion.
  if (!enabled) {
    return (
      <ul className={styles.board}>
        {slots.map((slot) => (
          <li key={slot.key} className={styles.boardItem}>
            {slot.children}
          </li>
        ))}
      </ul>
    );
  }

  // Mobile + tablet branch: per-card scroll-triggered fade-up. The
  // desktop deck animation doesn't translate well to a single-column
  // mobile layout (cards would have to fly the full column height),
  // so each polaroid reveals on its own as the user scrolls past it.
  if (cascade) {
    return (
      <motion.ul
        className={styles.board}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1 } },
        }}
      >
        {slots.map((slot) => (
          <motion.li
            key={slot.key}
            className={styles.boardItem}
            variants={{
              hidden: { opacity: 0, y: 24 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
              },
            }}
          >
            {slot.children}
          </motion.li>
        ))}
      </motion.ul>
    );
  }

  return (
    <div ref={trackRef} className={cn(styles.track, styles.animated)}>
      <ul className={styles.board}>
        {slots.map((slot, i) => {
          const offset = offsets.get(slot.key);
          const delay = delays.get(slot.key) ?? 0;
          const ready = offset !== undefined;
          // Earlier slots sit on top of the stack; later slots sit
          // underneath. `priority: "last"` cards drop to z 0 so they
          // sit at the very bottom of the visible pile and stay
          // there until they finally deal.
          const stackZ = slot.priority === "last" ? 0 : slots.length - i;
          return (
            <li
              key={slot.key}
              ref={(el) => {
                if (el) slotRefs.current.set(slot.key, el);
                else slotRefs.current.delete(slot.key);
              }}
              className={styles.boardItem}
              style={{ zIndex: stackZ }}
            >
              {ready ? (
                // motion.div mounts fresh once offsets are known, so
                // `initial` fires with the deck position — the card
                // APPEARS at the deck, then translates to its slot
                // when inView flips true.
                <motion.div
                  className={styles.dealWrap}
                  initial={{ x: offset.dx, y: offset.dy }}
                  animate={
                    inView ? { x: 0, y: 0 } : { x: offset.dx, y: offset.dy }
                  }
                  transition={{
                    type: "spring",
                    stiffness: 35,
                    damping: 14,
                    delay,
                  }}
                >
                  {slot.children}
                </motion.div>
              ) : (
                // Reserves the slot's footprint while we measure, so
                // the grid layout is stable from the first animated
                // render.
                <div style={{ visibility: "hidden" }}>{slot.children}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default FeatureDeck;
