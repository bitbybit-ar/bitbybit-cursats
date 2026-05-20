import type { SVGProps } from "react";

interface Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Person silhouette with a pixelated/mosaic face — a 3×3 grid of
 * tiles at varied opacities stands in for facial features. Says
 * "you don't have to identify yourself".
 */
export function AnonymousByDefault({ size = 200, ...props }: Props) {
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
      <circle cx="48" cy="36" r="18" />

      <rect x="36" y="24" width="7" height="7" fill="currentColor" fillOpacity="0.55" stroke="none" />
      <rect x="44.5" y="24" width="7" height="7" fill="currentColor" fillOpacity="0.3" stroke="none" />
      <rect x="53" y="24" width="7" height="7" fill="currentColor" fillOpacity="0.5" stroke="none" />
      <rect x="36" y="32.5" width="7" height="7" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <rect x="44.5" y="32.5" width="7" height="7" fill="currentColor" fillOpacity="0.7" stroke="none" />
      <rect x="53" y="32.5" width="7" height="7" fill="currentColor" fillOpacity="0.3" stroke="none" />
      <rect x="36" y="41" width="7" height="7" fill="currentColor" fillOpacity="0.5" stroke="none" />
      <rect x="44.5" y="41" width="7" height="7" fill="currentColor" fillOpacity="0.35" stroke="none" />
      <rect x="53" y="41" width="7" height="7" fill="currentColor" fillOpacity="0.6" stroke="none" />

      <path d="M22 86 V74 Q22 60 48 60 Q74 60 74 74 V86" />
    </svg>
  );
}

export default AnonymousByDefault;
