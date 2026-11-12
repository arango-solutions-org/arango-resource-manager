// Arango Badge. Replaces components/ui/badge.tsx from npx shadcn add. Matches the Figma Badge component.
// Colours come from --badge-* tokens, which switch to the teal set inside the sidebar or any data-surface="teal" container.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-focus aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3 [a&]:hover:font-semibold",
  {
    variants: {
      variant: {
        default: "bg-badge-primary text-badge-primary-text [a&]:hover:bg-badge-primary-hover",
        secondary:
          "bg-badge-secondary text-badge-secondary-text [a&]:hover:bg-badge-secondary-hover",
        destructive:
          "border-badge-destructive-border bg-badge-destructive text-badge-destructive-text focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-badge-destructive-hover",
        success:
          "border-badge-success-border bg-badge-success text-badge-success-text [a&]:hover:bg-badge-success-hover",
        warning:
          "border-badge-warning-border bg-badge-warning text-badge-warning-text [a&]:hover:bg-badge-warning-hover",
        outline:
          "border-badge-outline-border text-badge-outline-text [a&]:hover:bg-muted [a&]:hover:text-muted-foreground-on-card",
        ghost:
          "text-badge-ghost-text [a&]:hover:bg-badge-ghost-hover [a&]:hover:text-muted-foreground-on-card",
        link: "text-badge-link-text underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
