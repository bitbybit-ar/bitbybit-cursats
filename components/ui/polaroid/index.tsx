import React from "react";
import { cn } from "@/lib/utils";
import styles from "./polaroid.module.scss";

export interface PolaroidProps {
  /** Visual rotation. Defaults to "none". */
  rotation?: "left" | "right" | "none";
  /**
   * Content for the photo frame at the top of the polaroid — image,
   * icon, or arbitrary node. Centered inside a square frame.
   */
  frame?: React.ReactNode;
  /** Caption content below the frame (title, body). */
  children?: React.ReactNode;
  className?: string;
}

export function Polaroid({
  rotation = "none",
  frame,
  children,
  className,
}: PolaroidProps) {
  return (
    <div
      className={cn(styles.polaroid, styles[`rotation-${rotation}`], className)}
    >
      {frame !== undefined ? <div className={styles.frame}>{frame}</div> : null}
      <div className={styles.caption}>{children}</div>
    </div>
  );
}

export default Polaroid;
