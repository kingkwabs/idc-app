import { useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface LoginPageProps {
  onSuccess?: () => void;
}

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Enter a valid company email address and try again.";
    if (error.status === 401) return "The email or password you entered is incorrect.";
    if (error.status === 429) return "Too many sign-in attempts. Please wait and try again.";
  }
  return "We could not sign you in. Check your connection and try again.";
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      onSuccess?.();
    } catch (loginError) {
      setError(getLoginErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-muted blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <section className="relative grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden space-y-6 lg:block">
          <img src="/idce_logo.avif" alt="IDC Energy" className="h-16 w-auto" />
          <div className="max-w-lg space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Operations hub
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Every order, supplier, and shipment in one trusted workspace.
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              Sign in with your IDC Energy account to continue managing client operations.
            </p>
          </div>
        </div>

        <Card className="border-border/80 bg-card/95 shadow-2xl shadow-foreground/10 backdrop-blur">
          <CardHeader className="space-y-5">
            <img src="/idce_logo.avif" alt="IDC Energy" className="h-12 w-auto lg:hidden" />
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/60">
              <LockKeyhole aria-hidden="true" className="h-5 w-5 text-foreground" />
            </div>
            <div className="space-y-2">
              <CardTitle as="h1" className="text-2xl tracking-tight">Welcome back</CardTitle>
              <CardDescription>Use your company email and password to sign in.</CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              {error && (
                <Alert variant="destructive" id="login-error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="login-email">Email address</Label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  placeholder="name@idcenergy.co"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  className="h-11"
                />
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !email || !password}>
                {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <nav aria-label="Legal" className="mt-6 flex justify-center gap-5 border-t border-border pt-5 text-xs text-muted-foreground">
              <Link className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to="/privacy-policy">
                Privacy Policy
              </Link>
              <Link className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to="/eula">
                EULA
              </Link>
            </nav>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
