import Image from "next/image";

interface Props {
  size?: number;
}

/**
 * Lightning Network mark — pre-rendered raster vendored under
 * `public/images/logos/`. Sized to leave breathing room inside the
 * polaroid frame's tinted background.
 */
export function LightningLogo({ size = 160 }: Props) {
  return (
    <Image
      src="/images/logos/lightning.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}

export default LightningLogo;
