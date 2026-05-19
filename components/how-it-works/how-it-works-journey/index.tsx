"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookIcon,
  QrIcon,
  CheckIcon,
  KeyIcon,
  CoinIcon,
  ShoppingBagIcon,
} from "@/components/icons";
import { JourneyToggle, type Journey } from "@/components/how-it-works/journey-toggle";
import { StepSection } from "@/components/how-it-works/step-section";
import styles from "./how-it-works-journey.module.scss";

interface Step {
  title: string;
  body: string;
}

interface HowItWorksJourneyProps {
  labels: { buyer: string; teacher: string; aria: string };
  buyerSteps: Step[];
  teacherSteps: Step[];
}

// Icons live here (client) — they can't cross the server→client prop
// boundary as components. Order matches the step order: buyer =
// browse → pay with Lightning → receive; teacher = sign in with
// Nostr → set up payout → publish & sell.
const ICONS: Record<Journey, ReactNode[]> = {
  buyer: [
    <BookIcon key="b1" size={72} />,
    <QrIcon key="b2" size={72} />,
    <CheckIcon key="b3" size={72} />,
  ],
  teacher: [
    <KeyIcon key="t1" size={72} />,
    <CoinIcon key="t2" size={72} />,
    <ShoppingBagIcon key="t3" size={72} />,
  ],
};

function isJourney(value: string | null): value is Journey {
  return value === "buyer" || value === "teacher";
}

/**
 * Journey root: the pill toggle plus the active journey's three step
 * sections, cross-faded with `AnimatePresence mode="wait"`. The
 * active journey is mirrored to `?role=` via `history.replaceState`
 * (shareable, survives refresh) without forcing the route dynamic —
 * the server still prerenders the default (buyer) journey, the URL
 * is reconciled on mount.
 */
export function HowItWorksJourney({
  labels,
  buyerSteps,
  teacherSteps,
}: HowItWorksJourneyProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [role, setRole] = useState<Journey>("buyer");

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("role");
    if (isJourney(param)) setRole(param);
  }, []);

  const selectJourney = (next: Journey) => {
    setRole(next);
    const url = new URL(window.location.href);
    url.searchParams.set("role", next);
    window.history.replaceState(window.history.state, "", url);
  };

  const steps = role === "buyer" ? buyerSteps : teacherSteps;

  return (
    <div className={styles.root}>
      <div className={styles.toggleRow}>
        <JourneyToggle
          value={role}
          onChange={selectJourney}
          labels={{ buyer: labels.buyer, teacher: labels.teacher }}
          ariaLabel={labels.aria}
          reduceMotion={reduceMotion}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={role}
          id={`hiw-panel-${role}`}
          role="tabpanel"
          aria-labelledby={`hiw-tab-${role}`}
          tabIndex={0}
          className={styles.panel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.3 }}
        >
          {steps.map((step, i) => (
            <StepSection
              key={`${role}-${i}`}
              index={i + 1}
              title={step.title}
              body={step.body}
              icon={ICONS[role][i]}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default HowItWorksJourney;
