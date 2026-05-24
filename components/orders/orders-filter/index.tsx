"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Dropdown } from "@/components/ui/dropdown";
import {
  ORDER_STATUS_FILTERS,
  buildOrdersHref,
  type OrdersParams,
} from "@/lib/orders-params";
import styles from "./orders-filter.module.scss";

interface OrdersFilterProps {
  current: OrdersParams;
}

// Server-driven status filter for the seller order list. Mirrors the
// explore controls: the change writes through to the URL so the page
// (a server component) re-renders against the new params, resetting
// `page` to 1. `router.replace` keeps history clean — flipping the
// filter should not stack browser back entries.
export function OrdersFilter({ current }: OrdersFilterProps) {
  const t = useTranslations("orderLabel");
  const tOrders = useTranslations("orders");
  const router = useRouter();

  const options = ORDER_STATUS_FILTERS.map((value) => ({
    value,
    label: t(value),
  }));

  const onStatus = (value: string) => {
    router.replace(
      buildOrdersHref(current, {
        status: value as OrdersParams["status"],
        page: 1,
      })
    );
  };

  return (
    <div className={styles.controls}>
      <Dropdown
        options={options}
        value={current.status}
        onChange={onStatus}
        aria-label={tOrders("filterLabel")}
        className={styles.filter}
      />
    </div>
  );
}
