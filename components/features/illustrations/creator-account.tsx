import type { SVGProps } from "react";

interface Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Dashboard window: avatar + name at the top, three stacked course
 * rows below. Reads as "your teacher account — your courses, in one
 * place".
 */
export function CreatorAccount({ size = 200, ...props }: Props) {
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
      <rect x="8" y="12" width="80" height="72" rx="4" />

      <path d="M8 22 H88" strokeWidth="1.5" />
      <circle cx="14" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="26" cy="17" r="1.4" fill="currentColor" stroke="none" />

      <circle cx="20" cy="36" r="7" />
      <path d="M32 33 H64" strokeWidth="2" />
      <path d="M32 40 H54" strokeWidth="1.5" />

      <rect x="14" y="52" width="68" height="9" rx="1.5" strokeWidth="1.5" />
      <rect x="14" y="64" width="68" height="9" rx="1.5" strokeWidth="1.5" />
    </svg>
  );
}

export default CreatorAccount;
