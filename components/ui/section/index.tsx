import React from "react";
import { cn } from "@/lib/utils";
import styles from "./section.module.scss";

export type SectionProps = React.HTMLAttributes<HTMLElement>;

export const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <section
        ref={ref}
        className={cn(styles.section, className)}
        {...props}
      >
        {children}
      </section>
    );
  },
);
Section.displayName = "Section";

export default Section;
