import type { SVGProps } from "react";

interface Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Buyer silhouette → seller silhouette, payment arcing OVER a faded
 * "platform" box that's crossed through. Says "money skips the
 * middleman".
 */
export function NoCustody({ size = 200, ...props }: Props) {
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
          id="nc-arrow"
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

      <circle cx="16" cy="30" r="7" />
      <path d="M8 56 V46 Q8 38 16 38 Q24 38 24 46 V56 Z" />

      <circle cx="80" cy="30" r="7" />
      <path d="M72 56 V46 Q72 38 80 38 Q88 38 88 46 V56 Z" />

      <path
        d="M22 22 Q48 4 74 22"
        strokeWidth="1.5"
        markerEnd="url(#nc-arrow)"
      />

      <rect
        x="36"
        y="64"
        width="24"
        height="20"
        rx="2"
        fill="currentColor"
        fillOpacity="0.12"
        strokeWidth="1.5"
      />
      <path d="M32 62 L64 86" strokeWidth="2" />
    </svg>
  );
}

export default NoCustody;
