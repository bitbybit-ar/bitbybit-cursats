import type { SVGProps } from "react";

interface Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Phone with a receipt strip showing a QR code at top and item lines
 * below. Says "the receipt IS the delivery — at a URL, in-app".
 */
export function DeliveryInApp({ size = 200, ...props }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 96"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="28" y="8" width="40" height="80" rx="6" />
      <path d="M42 14 H54" strokeWidth="1.5" />

      <rect
        x="32"
        y="20"
        width="32"
        height="62"
        rx="2"
        fill="currentColor"
        fillOpacity="0.06"
        strokeWidth="1"
      />

      <rect x="38" y="26" width="20" height="20" rx="1" strokeWidth="1.5" />
      <rect
        x="40"
        y="28"
        width="4"
        height="4"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="52"
        y="28"
        width="4"
        height="4"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="40"
        y="40"
        width="4"
        height="4"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="46"
        y="34"
        width="3"
        height="3"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="50"
        y="38"
        width="3"
        height="3"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="46"
        y="40"
        width="3"
        height="3"
        fill="currentColor"
        stroke="none"
      />

      <path d="M38 54 H58" strokeWidth="1.5" />
      <path d="M38 60 H54" strokeWidth="1.5" />
      <path d="M38 66 H58" strokeWidth="1.5" />
      <path d="M38 72 H50" strokeWidth="1.5" />
    </svg>
  );
}

export default DeliveryInApp;
