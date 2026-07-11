import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  KeyRound,
  Link2,
  LoaderCircle,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  disconnectQuickBooks,
  getQuickBooksAuthorizationUrl,
  getQuickBooksStatus,
  type QuickBooksStatus,
} from "../lib/api";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

const REDIRECT_URI = import.meta.env.VITE_QB_REDIRECT_URI?.trim()
  || "https://idc-app.onrender.com/quickbooks/callback";

interface QuickBooksSettingsPageProps {
  userRole: string;
}

function formatDate(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function daysUntil(value?: string) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.ceil((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function Prerequisite({ children }: { children: string }) {
  return (
    <li className="flex gap-3 text-sm text-muted-foreground">
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" />
      <span>{children}</span>
    </li>
  );
}

export function QuickBooksSettingsPage({ userRole }: QuickBooksSettingsPageProps) {
  const [status, setStatus] = useState<QuickBooksStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const handledConnection = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setStatusError(null);
    try {
      setStatus(await getQuickBooksStatus());
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Could not load QuickBooks status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userRole === "admin") void refreshStatus();
    else setLoading(false);
  }, [refreshStatus, userRole]);

  useEffect(() => {
    const connection = new URLSearchParams(location.search).get("connection");
    if (!connection || handledConnection.current === connection) return;
    handledConnection.current = connection;

    if (connection === "success") {
      toast.success("QuickBooks connected", {
        description: "The encrypted company connection is ready for invoice validation.",
      });
      void refreshStatus();
    } else {
      toast.error("QuickBooks connection was not completed", {
        description: "No connection details were changed. Check the Intuit setup and try again.",
      });
    }
    navigate("/quickbooks", { replace: true });
  }, [location.search, navigate, refreshStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { authorization_url } = await getQuickBooksAuthorizationUrl();
      window.location.assign(authorization_url);
    } catch (error) {
      toast.error("Could not start QuickBooks connection", {
        description: error instanceof Error ? error.message : "Check the backend configuration and try again.",
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      "Disconnect QuickBooks? Intuit access will be revoked. Existing invoice references remain for audit history.",
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      await disconnectQuickBooks();
      toast.success("QuickBooks disconnected and access revoked");
      await refreshStatus();
    } catch (error) {
      toast.error("QuickBooks could not be disconnected", {
        description: error instanceof Error
          ? error.message
          : "Remote revocation failed, so the local connection was preserved for safety.",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (userRole !== "admin") {
    return (
      <Alert className="mx-auto max-w-2xl">
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>Administrator access required</AlertTitle>
        <AlertDescription>Only administrators can change the live accounting connection.</AlertDescription>
      </Alert>
    );
  }

  const connected = Boolean(status?.connected);
  const refreshDaysLeft = daysUntil(status?.refresh_expires_at);
  const grantExpired = connected && refreshDaysLeft !== null && refreshDaysLeft <= 0;
  const grantWarning = connected && refreshDaysLeft !== null && refreshDaysLeft > 0 && refreshDaysLeft <= 14;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Accounting integration</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">QuickBooks Online</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the single production company connection used for customer invoices.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refreshStatus()} disabled={loading}>
          <RefreshCw aria-hidden="true" className={loading ? "animate-spin" : undefined} />
          Refresh status
        </Button>
      </header>

      {statusError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Status unavailable</AlertTitle>
          <AlertDescription>{statusError}</AlertDescription>
        </Alert>
      )}

      {(grantWarning || grantExpired) && (
        <Alert variant={grantExpired ? "destructive" : "default"}>
          <Clock3 aria-hidden="true" />
          <AlertTitle>{grantExpired ? "QuickBooks authorization expired" : "Reconnect soon"}</AlertTitle>
          <AlertDescription>
            {grantExpired
              ? "Reconnect before attempting another invoice."
              : `The refresh grant expires in ${refreshDaysLeft} day${refreshDaysLeft === 1 ? "" : "s"}.`}
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-[var(--idc-red)] to-[var(--idc-amber)]" />
        <CardHeader className="gap-4 md:flex md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              {connected ? <Link2 aria-hidden="true" className="size-5" /> : <Unlink aria-hidden="true" className="size-5" />}
            </div>
            <div>
              <CardTitle>{loading ? "Checking connection..." : connected ? "Company connected" : "Connection required"}</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                {connected
                  ? "IDC can create customer records and idempotent invoices after an administrator approves the preview."
                  : "Connect only after the Render secrets, Intuit callback, and QuickBooks service item are configured."}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={connected
              ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-foreground"
              : "border-[var(--idc-amber)] bg-[var(--color-warning-soft)] text-foreground"}
          >
            {loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {!loading && connected && <CheckCircle2 aria-hidden="true" />}
            {!loading && !connected && <AlertCircle aria-hidden="true" />}
            {loading ? "Checking" : connected ? "Connected" : "Not connected"}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <DetailRow label="Access credential" value={formatDate(status?.token_expires_at)} />
            <DetailRow label="Refresh grant" value={formatDate(status?.refresh_expires_at)} />
            <DetailRow label="Credential storage" value="Encrypted at rest; server-only" />
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row">
            {!connected && (
              <Button type="button" onClick={() => void handleConnect()} disabled={connecting}>
                {connecting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ExternalLink aria-hidden="true" />}
                {connecting ? "Opening Intuit..." : "Connect QuickBooks"}
              </Button>
            )}
            {connected && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="text-destructive hover:text-destructive"
              >
                {disconnecting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Unlink aria-hidden="true" />}
                {disconnecting ? "Revoking access..." : "Disconnect and revoke"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <ServerCog aria-hidden="true" className="size-5 text-primary" />
              <div>
                <CardTitle>Production prerequisites</CardTitle>
                <CardDescription>These values must match Render, Intuit, and QuickBooks exactly.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3" role="list">
              <Prerequisite>Production client ID and secret are stored only in Render.</Prerequisite>
              <Prerequisite>QB_ENVIRONMENT is set to production.</Prerequisite>
              <Prerequisite>QB_TOKEN_ENCRYPTION_KEY is backed up separately from the database.</Prerequisite>
              <Prerequisite>QB_SERVICE_ITEM_NAME matches an active QuickBooks Service item.</Prerequisite>
              <Prerequisite>The service item has the intended income account and tax settings.</Prerequisite>
              <Prerequisite>The v1 invoice workflow is limited to USD transactions.</Prerequisite>
            </ul>
            <div className="mt-5 rounded-md border border-border bg-secondary/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Registered Intuit redirect URI</p>
              <code className="mt-1 block break-all text-sm text-foreground">{REDIRECT_URI}</code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <KeyRound aria-hidden="true" className="size-5 text-primary" />
              <div>
                <CardTitle>Safety model</CardTitle>
                <CardDescription>What v1 does before touching live accounting data.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>OAuth state is signed, persisted, and single-use. The browser never receives company or credential values.</p>
            <p>Each invoice is previewed first and stored with a stable Intuit request ID, preventing duplicate creation during retries.</p>
            <p>Disconnect revokes the Intuit grant before local credentials are removed. Invoice references remain for reconciliation.</p>
            <Alert>
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>v1 boundary</AlertTitle>
              <AlertDescription>One company, one configured service item, no attachments, and sandbox validation before live invoicing.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
