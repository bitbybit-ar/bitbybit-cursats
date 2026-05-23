import { cn } from "@/lib/utils";
import styles from "./container.module.scss";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  center?: boolean;
}

export function Container({ children, className, center }: ContainerProps) {
  return (
    <div className={cn(styles.container, center && styles.center, className)}>
      {children}
    </div>
  );
}

export default Container;
