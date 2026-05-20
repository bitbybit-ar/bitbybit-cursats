import type { SVGProps } from "react";

interface Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Three market stalls (striped awnings + counter + door) in a row,
 * with a "+" badge below — the universal "add yours" cue. Says
 * "marketplace of many shops, open to anyone".
 */
export function OpenMarketplace({ size = 200, ...props }: Props) {
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
      <path d="M5 22 L8 14 H30 L33 22 Z" />
      <path d="M13 14 V22 M19 14 V22 M25 14 V22" strokeWidth="1" />
      <rect x="8" y="22" width="22" height="28" />
      <path d="M14 34 H24" strokeWidth="1.5" />
      <rect x="15" y="36" width="8" height="14" />

      <path d="M34 22 L37 14 H59 L62 22 Z" />
      <path d="M42 14 V22 M48 14 V22 M54 14 V22" strokeWidth="1" />
      <rect x="37" y="22" width="22" height="28" />
      <path d="M43 34 H53" strokeWidth="1.5" />
      <rect x="44" y="36" width="8" height="14" />

      <path d="M63 22 L66 14 H88 L91 22 Z" />
      <path d="M71 14 V22 M77 14 V22 M83 14 V22" strokeWidth="1" />
      <rect x="66" y="22" width="22" height="28" />
      <path d="M72 34 H82" strokeWidth="1.5" />
      <rect x="73" y="36" width="8" height="14" />

      <circle
        cx="48"
        cy="72"
        r="12"
        fill="currentColor"
        fillOpacity="0.15"
        strokeWidth="1.5"
      />
      <path d="M48 64 V80" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 72 H56" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default OpenMarketplace;
