import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        primary: "bg-[#1e3a5f] text-white hover:bg-[#2d4a6f]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        danger: "bg-red-600 text-white hover:bg-red-700",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        md: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  fullWidth?: boolean
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const legacyVariants = {
  primary: "bg-[#1e3a5f] hover:bg-[#2d4a6f] text-white focus:ring-[#1e3a5f]",
  secondary: "bg-[#c4785a] hover:bg-[#d4917a] text-white focus:ring-[#c4785a]",
  outline: "border-2 border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white focus:ring-[#1e3a5f]",
  ghost: "text-[#1e3a5f] hover:bg-[#faf6f1] focus:ring-[#1e3a5f]",
  danger: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-600",
} as const

const legacySizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
} as const

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant,
      size,
      asChild = false,
      fullWidth = false,
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"
    const useUncleBashiStyle =
      (variant === undefined || variant in legacyVariants) &&
      (size === undefined || size in legacySizes)
    const resolvedVariant = variant ?? "primary"
    const resolvedSize = size ?? "md"
    const buttonClassName = useUncleBashiStyle
      ? [
          "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
          legacyVariants[resolvedVariant as keyof typeof legacyVariants],
          legacySizes[resolvedSize as keyof typeof legacySizes],
          fullWidth ? "w-full" : "",
          className,
        ].filter(Boolean).join(" ")
      : cn(buttonVariants({ variant, size }), fullWidth && "w-full", className)

    return (
      <Comp
        className={buttonClassName}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading ? (
          useUncleBashiStyle ? (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <span aria-hidden="true" className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
          )
        ) : leftIcon ? (
          <span className={useUncleBashiStyle ? "mr-2" : "mr-2 inline-flex items-center"}>{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && (!isLoading || useUncleBashiStyle) ? (
          <span className={useUncleBashiStyle ? "ml-2" : "ml-2 inline-flex items-center"}>{rightIcon}</span>
        ) : null}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
