"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import {
  buildPurchasesHref,
  type PurchasesParams,
} from "@/lib/purchases-params";
import styles from "./purchases-search.module.scss";

interface Props {
  current: PurchasesParams;
}

// Mirrors the debounce shape used by the explore Controls so the
// two surfaces feel identical when a buyer types in either.
const SEARCH_DEBOUNCE_MS = 300;

export function PurchasesSearch({ current }: Props) {
  const t = useTranslations("account");
  const router = useRouter();
  const [search, setSearch] = useState(current.q);

  useEffect(() => {
    setSearch(current.q);
  }, [current.q]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (search === current.q) return;
    const id = setTimeout(() => {
      router.replace(
        buildPurchasesHref(current, { q: search.trim(), page: 1 })
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, current, router]);

  return (
    <input
      type="search"
      role="search"
      className={styles.searchInput}
      placeholder={t("searchPlaceholder")}
      aria-label={t("searchLabel")}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      maxLength={100}
    />
  );
}

export default PurchasesSearch;
