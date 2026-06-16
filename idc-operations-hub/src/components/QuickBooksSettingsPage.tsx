import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Link2,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Separator } from "./ui/separator";
import {
  disconnectQuickBooks,
  getQuickBooksAuthorizationUrl,
  getQuickBooksStatus,
  type QuickBooksStatus,
} from "../lib/api";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";
const REDIRECT_URI = `${API_BASE}/quickbooks/callback`;

interface QuickBooksSettingsPageProps {
  userRole: string;
}

function formatDate(value?: string) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function daysUntil(value?: string) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/60 bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

export function QuickBooksSettingsPage({ userRole }: QuickBooksSettingsPageProps) {
  const [status, setStatus] = useState<QuickBooksStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = async () => {
    try {
      setLoading(true);
      setStatus(await getQuickBooksStatus());
    } catch (error) {
      console.error("Failed to fetch QuickBooks status:", error);
      toast.error("Could not load QuickBooks status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole === "admin") {
      refreshStatus();
    } else if (userRole) {
      setLoading(false);
    }
  }, [userRole]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const { authorization_url } = await getQuickBooksAuthorizationUrl();
      const authWindow = window.open(authorization_url, "_blank", "noopener,noreferrer");

      if (!authWindow) {
        window.location.assign(authorization_url);
        return;
      }

      toast.success("QuickBooks authorization opened", {
        description: "Finish the Intuit approval, then return here and refresh the status.",
      });
    } catch (error) {
      console.error("Failed to start QuickBooks connection:", error);
      toast.error("Could not start QuickBooks connection");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect QuickBooks from IDC Energy Database? Existing invoice references will remain for audit history.")) {
      return;
    }

    try {
      setDisconnecting(true);
      await disconnectQuickBooks();
      toast.success("QuickBooks disconnected");
      await refreshStatus();
    } catch (error) {
      console.error("Failed to disconnect QuickBooks:", error);
      toast.error("Could not disconnect QuickBooks");
    } finally {
      setDisconnecting(false);
    }
  };

  if (!userRole) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Loading QuickBooks settings...</div>
      </div>
    );
  }

  if (userRole !== "admin") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-2xl border border-white/50 bg-white/70 p-10 text-center shadow-sm backdrop-blur">
        <ShieldCheck className="h-12 w-12 text-teal-600" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Admins only</h1>
        <p className="mt-2 text-gray-600">
          QuickBooks connection settings can change live accounting data, so this page is limited to admins.
        </p>
      </div>
    );
  }

  const connected = Boolean(status?.connected);
  const refreshDaysLeft = daysUntil(status?.refresh_expires_at);
  const tokenWarning = connected && refreshDaysLeft !== null && refreshDaysLeft <= 14;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-teal-600 p-3 text-white shadow-lg shadow-teal-700/20">
              <Link2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">QuickBooks Connection</h1>
              <p className="text-gray-600">
                Connect the production QuickBooks company and manage OAuth tokens.
              </p>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={refreshStatus}
          disabled={loading}
          className="bg-white/70"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh status
        </Button>
      </div>

      <Card className="border-white/60 bg-white/75 shadow-xl shadow-gray-900/5 backdrop-blur">
        <CardHeader className="md:flex md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl text-gray-900">
              {connected ? (
                <CheckCircle2 className="h-6 w-6 text-teal-600" />
              ) : (
                <AlertCircle className="h-6 w-6 text-amber-600" />
              )}
              {connected ? "Connected to QuickBooks" : "Not connected yet"}
            </CardTitle>
            <CardDescription className="mt-2 text-base">
              {connected
                ? "IDC can create QuickBooks customers and invoices from approved transactions."
                : "Add the production keys in Render, then start OAuth from this page."}
            </CardDescription>
          </div>
          <Badge
            variant={connected ? "default" : "outline"}
            className={connected ? "mt-4 bg-teal-600 md:mt-0" : "mt-4 border-amber-300 bg-amber-50 text-amber-700 md:mt-0"}
          >
            {connected ? "Live connection" : "Setup required"}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-6">
          {tokenWarning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              The QuickBooks refresh token expires in {refreshDaysLeft} day{refreshDaysLeft === 1 ? "" : "s"}.
              Reconnect before then to avoid invoice creation failures.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <DetailRow label="Realm ID" value={status?.realm_id || "Not connected"} />
            <DetailRow label="Access token expires" value={formatDate(status?.token_expires_at)} />
            <DetailRow label="Refresh token expires" value={formatDate(status?.refresh_expires_at)} />
          </div>

          <Separator className="bg-gray-200" />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDisconnect}
              disabled={!connected || disconnecting}
              className="border-red-200 bg-white/70 text-red-700 hover:bg-red-50"
            >
              <Unlink className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-white/60 bg-white/75 shadow-sm backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <ServerCog className="h-5 w-5 text-teal-600" />
              Production checklist
            </CardTitle>
            <CardDescription>
              These values need to match Intuit and Render exactly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Render env var" value="QB_CLIENT_ID = Intuit production client ID" />
            <DetailRow label="Render env var" value="QB_CLIENT_SECRET = Intuit production client secret" />
            <DetailRow label="Render env var" value="QB_ENVIRONMENT = production" />
            <DetailRow label="Intuit redirect URI" value={REDIRECT_URI} />
          </CardContent>
        </Card>

        <Card className="border-teal-100 bg-gradient-to-br from-teal-50 to-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Clock3 className="h-5 w-5 text-teal-600" />
              How this works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <p>
              Connect opens Intuit OAuth in a new tab. Once you approve access, the backend stores the
              QuickBooks realm ID plus access and refresh tokens.
            </p>
            <p>
              Invoice creation uses the stored token server-side only. Production keys never go into
              the browser or Vercel.
            </p>
            <p>
              Disconnect deletes the stored OAuth tokens. Existing transaction invoice numbers stay in
              the database for reconciliation.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
