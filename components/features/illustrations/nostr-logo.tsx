import Image from "next/image";

interface Props {
  /** Rendered height in px; width is derived from the asset's 3:2 ratio. */
  size?: number;
}

/**
 * Nostr mark — pre-rendered raster vendored under
 * `public/images/logos/`. The source is 1125×750 (3:2), so we render
 * with a 3:2 aspect ratio to avoid squishing.
 */
export function NostrLogo({ size = 140 }: Props) {
  const height = size;
  const width = Math.round(size * 1.5);
  return (
    <Image
      src="/images/logos/nostr.png"
      alt=""
      width={width}
      height={height}
      aria-hidden="true"
    />
  );
}

export default NostrLogo;
