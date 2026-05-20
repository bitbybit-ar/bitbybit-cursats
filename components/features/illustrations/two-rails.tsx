import type { SVGProps } from "react";

interface Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Lightning bolt splitting into two destinations via thin arrows: a
 * peso banknote (CBU rail) and a sats coin (Lightning Address rail).
 * The coin's interior is the satoshi sign — a vertical bar crossed by
 * three horizontal bars, the proposed standard sat symbol.
 */
export function TwoRails({ size = 200, ...props }: Props) {
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
      <defs>
        <marker
          id="rail-arrow"
          markerWidth="5"
          markerHeight="5"
          refX="4"
          refY="2.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0 0 L5 2.5 L0 5 Z" fill="currentColor" stroke="none" />
        </marker>
      </defs>

      <path
        d="M56 8 L32 44 H46 L42 66 L64 30 H50 Z"
        fill="currentColor"
        fillOpacity="0.2"
      />

      <path
        d="M35 53 Q22 56 20 65"
        strokeWidth="1"
        markerEnd="url(#rail-arrow)"
      />
      <path
        d="M55 53 Q68 56 72 65"
        strokeWidth="1"
        markerEnd="url(#rail-arrow)"
      />

      <rect x="4" y="68" width="28" height="18" rx="2" />
      <path
        d="M24 73 C22 71 17 71 16 73 C15 75 17 77 20 77 C23 77 25 79 24 81 C23 83 18 83 16 81"
        strokeWidth="2"
      />
      <path d="M20 70 V86" strokeWidth="2" />

      <circle cx="78" cy="78" r="12" />
      <path d="M78 70 V86" strokeWidth="1.5" />
      <path
        d="M73 74 H83 M73 78 H83 M73 82 H83"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default TwoRails;
