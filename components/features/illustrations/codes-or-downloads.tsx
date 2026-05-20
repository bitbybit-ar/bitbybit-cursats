import type { SVGProps } from "react";

interface Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Left: a redemption ticket with a perforated stub and a
 * placeholder code like "ABC-XYZ". Right: a document with a
 * prominent downward arrow inside it — the universal "download"
 * symbol. Says "code OR file, per offering".
 */
export function CodesOrDownloads({ size = 200, ...props }: Props) {
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
      <rect x="6" y="32" width="36" height="32" rx="3" />
      <path d="M24 32 V64" strokeWidth="1" strokeDasharray="2 2" />
      <path d="M12 44 H20" strokeWidth="2.5" />
      <path d="M12 52 H22" strokeWidth="2.5" />
      <path d="M28 44 H38" strokeWidth="2.5" />
      <path d="M28 52 H38" strokeWidth="2.5" />

      <path d="M54 28 H78 L86 36 V70 H54 Z" />
      <path d="M78 28 V36 H86" strokeWidth="1.5" />

      <path d="M70 44 V60" strokeWidth="2.5" />
      <path d="M62 54 L70 62 L78 54" strokeWidth="2.5" />
    </svg>
  );
}

export default CodesOrDownloads;
