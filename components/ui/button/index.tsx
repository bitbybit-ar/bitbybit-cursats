import React from "react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import styles from "./button.module.scss";

type ButtonBaseProps = {
  variant?:
    | "primary"
    | "secondary"
    | "accent"
    | "nostr"
    | "success"
    | "danger"
    | "outline"
    | "ghost"
    | "link";
  size?: "sm" | "default" | "lg";
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
};

type ButtonAsButton = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined;
  };

type ButtonAsLink = ButtonBaseProps &
  Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof ButtonBaseProps | "href"
  > & {
    href: React.ComponentProps<typeof Link>["href"];
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "default",
      fullWidth,
      children,
      ...props
    },
    ref
  ) {
    const classes = cn(
      styles.button,
      styles[`variant-${variant}`],
      styles[`size-${size}`],
      fullWidth && styles.fullWidth,
      className
    );

    if (props.href !== undefined) {
      const { href, ...anchorProps } = props;
      return (
        <Link href={href} className={classes} {...anchorProps}>
          {children}
        </Link>
      );
    }

    const { href: _href, ...buttonProps } = props;
    return (
      <button ref={ref} className={classes} {...buttonProps}>
        {children}
      </button>
    );
  }
);

export default Button;
