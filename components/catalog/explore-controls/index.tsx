"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Dropdown } from "@/components/ui/dropdown";
import {
  buildExploreHref,
  type ExploreParams,
  type OfferingTypeFilter,
  type SortKey,
} from "@/lib/explore-params";
import styles from "./explore-controls.module.scss";

interface ControlsProps {
  current: ExploreParams;
}

// Debounce window for the search input. Short enough that the grid
// keeps up with typing; long enough to skip a fetch per keystroke.
const SEARCH_DEBOUNCE_MS = 300;

// Every control writes through to the URL so the page (a server
// component) re-renders against the new params. `router.replace`
// keeps history clean — flipping filters should not stack browser
// back entries. Any filter change resets `page` to 1.
export function Controls({ current }: ControlsProps) {
  const t = useTranslations("catalog.controls");
  const router = useRouter();
  const [search, setSearch] = useState(current.q);

  // Sync local input state when the page navigates externally
  // (e.g. the user hits "back" or clicks a pager link).
  useEffect(() => {
    setSearch(current.q);
  }, [current.q]);

  // Skip the first render's debounce so we don't push an immediate
  // navigation on mount when the input already matches the URL.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (search === current.q) return;
    const id = setTimeout(() => {
      router.replace(buildExploreHref(current, { q: search.trim(), page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, current, router]);

  const typeOptions = [
    { value: "", label: t("typeAny") },
    { value: "code", label: t("typeCode") },
    { value: "download", label: t("typeDownload") },
  ];

  const sortOptions = [
    { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") },
    { value: "price_asc", label: t("sortPriceAsc") },
    { value: "price_desc", label: t("sortPriceDesc") },
  ];

  const onType = (raw: string) => {
    const next = raw === "" ? null : (raw as OfferingTypeFilter);
    router.replace(buildExploreHref(current, { type: next, page: 1 }));
  };
  const onSort = (raw: string) => {
    router.replace(
      buildExploreHref(current, { sort: raw as SortKey, page: 1 })
    );
  };

  return (
    <div className={styles.controls} role="search">
      <input
        type="search"
        className={styles.searchInput}
        placeholder={t("searchPlaceholder")}
        aria-label={t("search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        maxLength={100}
      />
      <div className={styles.filters}>
        <Dropdown
          options={typeOptions}
          value={current.type ?? ""}
          onChange={onType}
          aria-label={t("type")}
          className={styles.filterDropdown}
        />
        <Dropdown
          options={sortOptions}
          value={current.sort}
          onChange={onSort}
          aria-label={t("sort")}
          className={styles.filterDropdown}
        />
      </div>
    </div>
  );
}
