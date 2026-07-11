import * as React from "react";

import { cn } from "./utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-base text-foreground shadow-[var(--shadow-control)] outline-none transition-[background-color,border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out-ui)] placeholder:text-muted-foreground selection:bg-accent selection:text-accent-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 read-only:bg-muted motion-reduce:transition-none md:text-sm",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)]",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-[var(--color-destructive-ring)]",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";

export { Input };
