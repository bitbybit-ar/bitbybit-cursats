import type { IconProps } from "./types";

export function QrIcon({
  size = 24,
  className,
  color = "currentColor",
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="6" y="6" width="1" height="1" />
      <rect x="17" y="6" width="1" height="1" />
      <rect x="6" y="17" width="1" height="1" />
      <path d="M14 14h3v3" />
      <path d="M14 19h2" />
      <path d="M19 14v2" />
      <path d="M19 19h2v2" />
    </svg>
  );
}
