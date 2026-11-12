// Arango Alert. Replaces components/ui/alert.tsx from npx shadcn add. Matches the Figma Alert component.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-muted-foreground bg-card text-card-foreground",
        destructive:
          "border-alert-destructive-border bg-alert-destructive text-alert-destructive-text *:data-[slot=alert-description]:text-alert-destructive-text [&>svg]:text-current",
        success:
          "border-alert-success-border bg-alert-success text-alert-success-text *:data-[slot=alert-description]:text-alert-success-text [&>svg]:text-current",
        warning:
          "border-alert-warning-border bg-alert-warning text-alert-warning-text *:data-[slot=alert-description]:text-alert-warning-text [&>svg]:text-current",
        info: "border-info-ring bg-muted/50 text-card-foreground [&>svg]:text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground-on-card [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }

