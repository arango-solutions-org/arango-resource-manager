// Arango Button. Replaces components/ui/button.tsx from npx shadcn add. Matches the Figma Button component.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring-focus aria-invalid:border aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "bg-button-destructive text-button-destructive-text hover:bg-button-destructive-hover focus-visible:border focus-visible:border-button-destructive-border focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-input bg-background text-foreground hover:bg-muted focus-visible:border-ring dark:bg-input/30 dark:hover:bg-muted",
        secondary: "bg-button-secondary text-secondary-foreground hover:bg-button-secondary-hover",
        ghost: "text-foreground hover:bg-muted",
        link: "font-semibold text-primary underline-offset-4 hover:text-primary-hover hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-2.5",
        xs: "h-6 gap-1 rounded-sm px-2",
        sm: "h-8 gap-1 px-2.5",
        lg: "h-10 gap-1.5 px-2.5",
        icon: "size-9",
        "icon-xs": "size-6 rounded-sm",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
