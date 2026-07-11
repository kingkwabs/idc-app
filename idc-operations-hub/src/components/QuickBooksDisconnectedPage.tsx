import { CheckCircle2, Link2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function QuickBooksDisconnectedPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-[var(--idc-red)] to-[var(--idc-amber)]" />
      <Card className="relative w-full max-w-2xl">
        <CardHeader className="space-y-5">
          <img src="/idce_logo.avif" alt="IDC Energy" className="h-12 w-auto" />
          <div className="flex size-11 items-center justify-center rounded-lg bg-[var(--color-success-soft)] text-[var(--color-success)]">
            <CheckCircle2 aria-hidden="true" className="size-5" />
          </div>
          <div className="space-y-2">
            <CardTitle as="h1" className="text-2xl">QuickBooks connection terminated</CardTitle>
            <CardDescription className="text-base leading-7">
              The connection between IDC Energy Database and the QuickBooks Online company has been disconnected. IDC cannot create new QuickBooks invoices until an administrator reconnects it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border border-border bg-secondary/60 p-4 text-sm leading-6 text-muted-foreground">
            Existing IDC transaction records and previously stored invoice references remain available for audit and reconciliation. Disconnecting does not delete records already created in QuickBooks.
          </div>

          <section aria-labelledby="reconnect-heading">
            <h2 id="reconnect-heading" className="flex items-center gap-2 font-semibold text-foreground">
              <Link2 aria-hidden="true" className="size-4 text-primary" />
              To reconnect
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Sign in to IDC Energy Database with an administrator account.</li>
              <li>Open QuickBooks Online under Administration.</li>
              <li>Select Connect QuickBooks and approve the company in Intuit.</li>
            </ol>
          </section>

          <Button asChild>
            <Link to="/quickbooks">Return to IDC Energy Database</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
