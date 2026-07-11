import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 [transition-timing-function:var(--ease-out-ui)] active:scale-[0.98] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)] disabled:pointer-events-none disabled:scale-100 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-[var(--color-destructive-ring)] motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-control)] hover:bg-[var(--color-primary-hover)]",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground shadow-[var(--shadow-control)] hover:bg-[var(--color-destructive-hover)] focus-visible:ring-[var(--color-destructive-ring)]",
        outline:
          "border-input bg-card text-foreground shadow-[var(--shadow-control)] hover:border-border hover:bg-secondary",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-[var(--color-secondary-hover)]",
        ghost:
          "text-foreground shadow-none hover:bg-secondary hover:text-foreground",
        link: "border-transparent text-primary underline-offset-4 shadow-none hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});

Button.displayName = "Button";

// Alert dialogs, calendars, and pagination reuse the same visual contract.
export { Button, buttonVariants };
