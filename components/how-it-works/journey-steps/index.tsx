"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
  type Variants,
} from "framer-motion";
import { Polaroid } from "@/components/ui/polaroid";
import { Bubble } from "@/components/common/bubble";
import styles from "./journey-steps.module.scss";

type Variant = "buyer" | "teacher";

interface Step {
  title: string;
  body: string;
}

interface JourneyStepsProps {
  /** Picks the icon set; also used for stable keys. */
  variant: Variant;
  /** Section heading ("Si comprás un curso" / "Si enseñás algo"). */
  title: string;
  steps: Step[];
}

const POLAROID_ROTATION = ["left", "right", "left", "right"] as const;

// Platform bubble sizing (px — matching `<Bubble>`'s numeric API,
// the same convention hero-bubbles uses).
const BUBBLE_SIZE = 96;
const PARTICLE_SIZE = 14;
const PARTICLE_SPREAD = 56;

// One distinct hue per step. The numbered bubble reads at a usable
// opacity; the scatter particles are deliberately faint so they
// don't fight the bubble.
type BubbleHue = "orange" | "cyan" | "pink" | "gold";
const STEP_HUES: BubbleHue[] = ["orange", "cyan", "pink", "gold"];
const BUBBLE_OPACITY = 0.4;
const PARTICLE_OPACITY = 0.22;

// Scroll-progress timeline (0 → 1 across the pinned region). Every
// motion value derives from this single progress, so scrolling *up*
// scrubs the sequence backward for free; scrolling *down* only ever
// advances it (useTransform clamps, so a formed polaroid stays
// formed). Spans are derived from the step count, so 3 or 4 steps
// both fit the [0,1] range with a short lead and tail.
const STEP_LEAD = 0.05;
const STEP_TAIL = 0.05;

// Sub-curve within one step's span (fractions of the span):
// a snappy rise, then a long, lingering burst so the explosion is
// clearly visible even at a quick scroll, then the polaroid forms.
function stepRanges(i: number, span: number) {
  const base = STEP_LEAD + i * span;
  return {
    riseStart: base,
    riseEnd: base + span * 0.4,
    burstStart: base + span * 0.4,
    burstMid: base + span * 0.56,
    burstEnd: base + span * 0.74,
  };
}

// Ten particles evenly spaced on a ring — the burst scatter.
const PARTICLE_ANGLES = Array.from(
  { length: 10 },
  (_, k) => (k / 10) * Math.PI * 2
);

/**
 * One scatter particle: a tiny platform bubble. Radius and fade
 * derive from the shared progress so the burst implodes cleanly
 * when scrolled backward.
 */
function Particle({
  angle,
  color,
  progress,
  burstStart,
  burstMid,
  burstEnd,
}: {
  angle: number;
  color: BubbleHue;
  progress: MotionValue<number>;
  burstStart: number;
  burstMid: number;
  burstEnd: number;
}) {
  const radius = useTransform(
    progress,
    [burstStart, burstEnd],
    [4, PARTICLE_SPREAD]
  );
  const x = useTransform(radius, (r) => Math.cos(angle) * r);
  const y = useTransform(radius, (r) => Math.sin(angle) * r);
  const opacity = useTransform(
    progress,
    [burstStart, burstMid, burstEnd],
    [0, 1, 0]
  );

  return (
    <motion.span
      className={styles.particle}
      style={{
        width: PARTICLE_SIZE,
        height: PARTICLE_SIZE,
        marginLeft: -PARTICLE_SIZE / 2,
        marginTop: -PARTICLE_SIZE / 2,
        x,
        y,
        opacity,
      }}
      aria-hidden="true"
    >
      <Bubble
        size={PARTICLE_SIZE}
        color={color}
        variant="solid"
        opacity={PARTICLE_OPACITY}
        position={{ top: "0", left: "0" }}
        animation="none"
      />
    </motion.span>
  );
}

/**
 * One step: a numbered platform bubble rises from the bottom of the
 * viewport into this slot, particle-bursts, and leaves a polaroid in
 * its place. The polaroid is always in the DOM (only opacity/scale
 * animate) so the reserved slot footprint never reflows, and it
 * stays put once formed (clamped) when scrolling on.
 */
function JourneyStep({
  step,
  index,
  color,
  progress,
  span,
}: {
  step: Step;
  index: number;
  color: BubbleHue;
  progress: MotionValue<number>;
  span: number;
}) {
  const r = stepRanges(index, span);

  // Bubble: off-screen-low → slot center → swallowed by the burst.
  const bubbleY = useTransform(
    progress,
    [r.riseStart, r.riseEnd],
    ["75vh", "0vh"]
  );
  const bubbleScale = useTransform(
    progress,
    [r.riseStart, r.riseEnd, r.burstStart, r.burstEnd],
    [0.5, 1, 1, 0.25]
  );
  const bubbleOpacity = useTransform(
    progress,
    [r.riseStart, r.riseStart + 0.02, r.burstStart, r.burstEnd],
    [0, 1, 1, 0]
  );

  // The polaroid is a two-state element with a WIDE hysteresis
  // band, not a frame-by-frame scrub. It forms only once the bubble
  // has fully burst and vanished (`burstEnd`) — so the bubble never
  // overlaps the card — and stays put; it only un-forms if you
  // scroll up far enough to rewind this step past its bubble's
  // rise. Small down-scroll jitter / rubber-band can never make a
  // shown card disappear, while a genuine scroll-up still reverses
  // it.
  const [formed, setFormed] = useState(() => progress.get() >= r.burstEnd);
  useMotionValueEvent(progress, "change", (v) => {
    if (v >= r.burstEnd) setFormed(true);
    else if (v <= r.riseStart) setFormed(false);
  });

  return (
    <div className={styles.slot}>
      <div className={styles.burstLayer} aria-hidden="true">
        <motion.div
          className={styles.bubbleWrap}
          style={{
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            y: bubbleY,
            scale: bubbleScale,
            opacity: bubbleOpacity,
          }}
        >
          <Bubble
            size={BUBBLE_SIZE}
            color={color}
            variant="icon"
            opacity={BUBBLE_OPACITY}
            icon={<span className={styles.bubbleNumber}>{index + 1}</span>}
            position={{ top: "0", left: "0" }}
            animation="none"
          />
        </motion.div>
        {PARTICLE_ANGLES.map((angle) => (
          <Particle
            key={angle}
            angle={angle}
            color={color}
            progress={progress}
            burstStart={r.burstStart}
            burstMid={r.burstMid}
            burstEnd={r.burstEnd}
          />
        ))}
      </div>

      <motion.div
        className={styles.card}
        initial={false}
        animate={{ opacity: formed ? 1 : 0, scale: formed ? 1 : 0.82 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <Polaroid
          rotation={POLAROID_ROTATION[index % POLAROID_ROTATION.length]}
        >
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </Polaroid>
      </motion.div>
    </div>
  );
}

/**
 * The pinned experience: a tall scroll track with a sticky stage
 * pinned below the navbar and vertically centered. The title fades
 * in at its final place (it never slides up from the bottom); scroll
 * progress over the track then drives the steps in sequence.
 */
function PinnedJourney({ variant, title, steps }: JourneyStepsProps) {
  const trackRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });
  // Separate progress for the title: 0 as the section first peeks
  // in from the bottom, 1 once it's pinned. The title stays hidden
  // through the slide-up and only fades in at its final, pinned
  // place — so it appears *in place*, not rising from the bottom.
  const { scrollYProgress: enterProgress } = useScroll({
    target: trackRef,
    offset: ["start end", "start start"],
  });
  const titleOpacity = useTransform(enterProgress, [0.55, 0.95], [0, 1]);

  const span = (1 - STEP_LEAD - STEP_TAIL) / steps.length;

  return (
    <section ref={trackRef} className={styles.track} aria-label={title}>
      <div className={styles.sticky}>
        <div className={styles.stage}>
          <motion.h2 className={styles.title} style={{ opacity: titleOpacity }}>
            {title}
          </motion.h2>
          <div className={styles.row}>
            {steps.map((step, i) => (
              <JourneyStep
                key={`${variant}-${i}`}
                step={step}
                index={i}
                color={STEP_HUES[i % STEP_HUES.length]}
                progress={scrollYProgress}
                span={span}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Fallback: the plain staggered row, view-revealed. Used for
 * `prefers-reduced-motion`, narrow viewports (the pinned 100vh stage
 * can't hold three stacked polaroids on a phone), and the
 * server/no-JS render so the content is always present.
 */
function StaticJourney({ variant, title, steps }: JourneyStepsProps) {
  const reduceMotion = useReducedMotion() ?? false;

  const list: Variants = {
    hidden: {},
    visible: {
      transition: {
        delayChildren: 0.05,
        staggerChildren: reduceMotion ? 0 : 0.12,
      },
    },
  };

  const card: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 28, scale: 0.96 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 90, damping: 16 },
        },
      };

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2 className={styles.title}>{title}</h2>

        <motion.ol
          className={styles.grid}
          variants={list}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {steps.map((step, i) => (
            <motion.li
              key={`${variant}-${i}`}
              className={styles.gridCard}
              variants={card}
            >
              <Polaroid
                rotation={POLAROID_ROTATION[i % POLAROID_ROTATION.length]}
              >
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </Polaroid>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}

/**
 * Decides which experience to mount. Renders the static fallback on
 * the server and first client paint (so markup matches and the
 * content is always there for SEO / no-JS), then upgrades to the
 * pinned sequence on wide viewports once mounted.
 */
export function JourneySteps(props: JourneyStepsProps) {
  const reduceMotion = useReducedMotion();
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      setPinned(false);
      return;
    }
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setPinned(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [reduceMotion]);

  return pinned ? <PinnedJourney {...props} /> : <StaticJourney {...props} />;
}

export default JourneySteps;
