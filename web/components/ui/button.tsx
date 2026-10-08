import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "stamp inline-flex select-none items-center justify-center gap-2 whitespace-nowrap border text-center leading-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  // lime plate, --lime-ink text
  primary: "border-lime bg-lime text-lime-ink hover:bg-ink hover:border-ink",
  // --ink outline
  secondary: "border-ink bg-transparent text-ink hover:bg-ink hover:text-paper",
  danger: "border-danger bg-danger text-paper hover:bg-transparent hover:text-danger",
  ghost: "border-ink-3 bg-transparent text-ink-2 hover:border-ink hover:text-ink",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-11 px-5 text-[13px]",
  lg: "h-14 px-7 text-[15px]",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type ButtonAsLink = CommonProps & { href: string; external?: boolean };
type ButtonAsButton = CommonProps & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>;

export type ButtonProps = ButtonAsLink | ButtonAsButton;

/**
 * Tally button. Primary = lime plate; secondary = ink outline.
 * Pass `href` to render a link (internal via next/link, `external` for a new tab).
 */
export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { href, external, variant, size, className, children } = props;
    const cls = buttonClasses(variant, size, className);
    if (external) {
      return (
        <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  const { variant, size, className, children, type, ...rest } = props;
  return (
    <button type={type ?? "button"} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
