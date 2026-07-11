import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium outline-none transition-[color,background-color,border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out-ui)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)] aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-[var(--color-destructive-ring)] motion-reduce:transition-none [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-[var(--color-accent-border)] bg-accent text-accent-foreground [a&]:hover:bg-[var(--color-accent-hover)]",
        secondary:
          "border-border bg-secondary text-secondary-foreground [a&]:hover:bg-[var(--color-secondary-hover)]",
        destructive:
          "border-[var(--color-accent-border)] bg-[var(--color-destructive-soft)] text-destructive [a&]:hover:bg-[var(--color-accent-hover)] focus-visible:ring-[var(--color-destructive-ring)]",
        outline:
          "border-border bg-card text-foreground [a&]:hover:bg-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

// Keep variant composition available to non-component consumers.
export { Badge, badgeVariants };
