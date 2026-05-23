"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./faq-list.module.scss";

// Question ids — the i18n keys are `questions.<id>Q` / `questions.<id>A`.
// Kept here (the only consumer) so the server page just renders <FaqList />.
const QUESTION_KEYS = [
  "lightning",
  "wallet",
  "wapu",
  "argentina",
  "anonymous",
  "delivery",
  "lostReceipt",
  "creatorPayout",
  "nostrSignIn",
  "fees",
] as const;

type QuestionKey = (typeof QUESTION_KEYS)[number];

export function FaqList() {
  const t = useTranslations("faq");
  // Single-open accordion: only one question is expanded at a time, so
  // opening a new one collapses the previously open one.
  const [openKey, setOpenKey] = useState<QuestionKey | null>(null);

  return (
    <ul className={styles.list}>
      {QUESTION_KEYS.map((key) => {
        const isOpen = openKey === key;
        return (
          <li key={key} className={styles.item}>
            <details className={styles.details} open={isOpen}>
              <summary
                className={styles.summary}
                // Drive `open` from state rather than the native toggle so
                // a click on a closed question also closes whichever other
                // one is open.
                onClick={(e) => {
                  e.preventDefault();
                  setOpenKey(isOpen ? null : key);
                }}
              >
                <span className={styles.question}>
                  {t(`questions.${key}Q`)}
                </span>
                <span className={styles.chevron} aria-hidden="true">
                  +
                </span>
              </summary>
              <p className={styles.answer}>{t(`questions.${key}A`)}</p>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export default FaqList;
