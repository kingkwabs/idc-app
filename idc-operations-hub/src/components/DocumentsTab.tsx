import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  File,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteDocument,
  documentDownloadUrl,
  listDocuments,
  uploadDocument,
} from "../lib/api";
import { formatEasternDate } from "../lib/dateTime";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type DocumentCategory = "Client PO" | "Supplier PO" | "Invoice" | "Other";
type PurchaseOrderType = "clientPO" | "supplierPO";

interface UploadedFile {
  id: number;
  name: string;
  category: DocumentCategory;
  uploadedBy?: string;
  uploadedAt: string;
  date: string;
  type: "pdf" | "image" | "document";
  size?: string;
}

interface PurchaseOrderUploadProps {
  title: string;
  description: string;
  type: PurchaseOrderType;
  latestFile?: UploadedFile;
  busy: boolean;
  disabled: boolean;
  error?: string;
  onUpload: (type: PurchaseOrderType, file: globalThis.File, poNumber: string) => Promise<boolean>;
}

interface DocumentsTabProps {
  transactionId: number;
}

function uiCategoryToApi(category: DocumentCategory): string {
  switch (category) {
    case "Client PO":
      return "client-po";
    case "Supplier PO":
      return "supplier-po";
    case "Invoice":
      return "invoice";
    default:
      return "other";
  }
}

function apiCategoryToUi(category?: string): DocumentCategory {
  switch (category) {
    case "client-po":
      return "Client PO";
    case "supplier-po":
      return "Supplier PO";
    case "invoice":
      return "Invoice";
    default:
      return "Other";
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatBytes(bytes?: number | null): string | undefined {
  if (typeof bytes !== "number" || bytes < 0) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function documentType(mimeType?: string | null): UploadedFile["type"] {
  if (mimeType?.includes("pdf")) return "pdf";
  if (mimeType?.startsWith("image/")) return "image";
  return "document";
}

function fileIcon(type: UploadedFile["type"]) {
  if (type === "pdf") return <FileText aria-hidden="true" className="size-4 text-primary" />;
  if (type === "image") return <ImageIcon aria-hidden="true" className="size-4 text-[var(--color-info)]" />;
  return <File aria-hidden="true" className="size-4 text-muted-foreground" />;
}

function categoryBadgeClass(category: DocumentCategory): string {
  switch (category) {
    case "Client PO":
      return "border-border bg-[var(--color-info-soft)] text-[var(--color-info)]";
    case "Supplier PO":
      return "border-border bg-[var(--color-success-soft)] text-[var(--color-success)]";
    case "Invoice":
      return "border-[var(--color-accent-border)] bg-accent text-accent-foreground";
    default:
      return "border-border bg-secondary text-secondary-foreground";
  }
}

function readFileAsBase64(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The selected file could not be read"));
        return;
      }
      const base64 = reader.result.split(",")[1];
      if (!base64) {
        reject(new Error("The selected file is empty or unsupported"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("The selected file could not be read"));
    reader.readAsDataURL(file);
  });
}

function PurchaseOrderUpload({
  title,
  description,
  type,
  latestFile,
  busy,
  disabled,
  error,
  onUpload,
}: PurchaseOrderUploadProps) {
  const poNumberId = useId();
  const fileInputId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [poNumber, setPoNumber] = useState("");
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile || !poNumber.trim() || busy) return;

    const uploaded = await onUpload(type, selectedFile, poNumber.trim());
    if (!uploaded) return;

    setPoNumber("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const actionLabel = type === "clientPO" ? "Upload client PO" : "Upload supplier PO";

  return (
    <form onSubmit={handleSubmit} className="min-w-0 p-5 sm:p-6" aria-busy={busy}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="font-semibold text-foreground">{title}</h4>
          <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge
          variant="outline"
          className={latestFile ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]" : undefined}
        >
          {latestFile ? "On file" : "Required"}
        </Badge>
      </div>

      {latestFile ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border bg-secondary p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-success-soft)] text-[var(--color-success)]">
            <CheckCircle2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{latestFile.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Latest upload, {latestFile.date}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        <div className="space-y-2">
          <Label htmlFor={poNumberId}>{type === "clientPO" ? "Client PO number" : "Supplier PO number"}</Label>
          <Input
            id={poNumberId}
            value={poNumber}
            onChange={(event) => setPoNumber(event.target.value)}
            placeholder="Enter the PO reference"
            autoComplete="off"
            required
            disabled={disabled}
            aria-describedby={error ? errorId : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fileInputId}>Document</Label>
          <Input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            className="h-auto cursor-pointer py-1.5"
            required
            disabled={disabled}
            aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
          />
          <p className="text-xs text-muted-foreground">PDF, JPG, or PNG, up to 8 MB.</p>
        </div>
      </div>

      {error ? <p id={errorId} role="alert" className="mt-4 text-sm font-medium text-destructive">{error}</p> : null}

      <Button type="submit" variant={latestFile ? "outline" : "default"} className="mt-5 w-full sm:w-auto" disabled={disabled || !selectedFile || !poNumber.trim()}>
        {busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Upload aria-hidden="true" />}
        {busy ? "Uploading" : actionLabel}
      </Button>
    </form>
  );
}

export function DocumentsTab({ transactionId }: DocumentsTabProps) {
  const requestId = useRef(0);
  const uploadInFlight = useRef(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loadedTransactionId, setLoadedTransactionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<PurchaseOrderType | null>(null);
  const [uploadError, setUploadError] = useState<{ type: PurchaseOrderType; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError(null);

    try {
      const response = await listDocuments(transactionId);
      if (currentRequest !== requestId.current) return;
      setFiles(response.items.map((document) => ({
        id: document.id,
        name: document.name,
        category: apiCategoryToUi(document.category),
        uploadedBy: document.uploaded_by?.trim() || undefined,
        uploadedAt: document.uploaded_at,
        date: formatEasternDate(document.uploaded_at),
        size: formatBytes(document.size_bytes),
        type: documentType(document.mime_type),
      })));
      setLoadedTransactionId(transactionId);
    } catch (error: unknown) {
      if (currentRequest === requestId.current) {
        setLoadError(errorMessage(error, "Documents could not be loaded"));
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const visibleFiles = useMemo(
    () => (loadedTransactionId === transactionId ? files : []),
    [files, loadedTransactionId, transactionId],
  );

  const latestPurchaseOrders = useMemo(
    () => ({
      clientPO: visibleFiles.find((file) => file.category === "Client PO"),
      supplierPO: visibleFiles.find((file) => file.category === "Supplier PO"),
    }),
    [visibleFiles],
  );

  const handleUpload = async (type: PurchaseOrderType, file: globalThis.File, poNumber: string): Promise<boolean> => {
    if (uploadInFlight.current) return false;
    uploadInFlight.current = true;
    setUploading(type);
    setUploadError(null);
    setActionError(null);
    try {
      const contentBase64 = await readFileAsBase64(file);
      await uploadDocument(transactionId, {
        category: uiCategoryToApi(type === "clientPO" ? "Client PO" : "Supplier PO"),
        name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        content_base64: contentBase64,
        po_number: poNumber,
      });
      await load();
      toast.success(type === "clientPO" ? "Client PO uploaded" : "Supplier PO uploaded");
      return true;
    } catch (error: unknown) {
      setUploadError({ type, message: errorMessage(error, "The request could not be completed") });
      return false;
    } finally {
      uploadInFlight.current = false;
      setUploading(null);
    }
  };

  const handleDelete = async (file: UploadedFile) => {
    const confirmed = window.confirm(`Delete ${file.name}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(file.id);
    setActionError(null);

    try {
      await deleteDocument(transactionId, file.id);
      await load();
      toast.success(`${file.name} was deleted`);
    } catch (error: unknown) {
      setActionError(errorMessage(error, `${file.name} could not be deleted`));
    } finally {
      setDeletingId(null);
    }
  };

  const fileCountLabel = `${visibleFiles.length} ${visibleFiles.length === 1 ? "file" : "files"}`;

  return (
    <div className="space-y-7">
      <header className="border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Transaction record</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Documents</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Store purchase orders and supporting files with the transaction.</p>
      </header>

      <section aria-labelledby="purchase-orders-title" className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
        <div className="border-b bg-secondary px-5 py-4">
          <h3 id="purchase-orders-title" className="text-base font-semibold text-foreground">Purchase orders</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Uploading also updates the matching PO reference on this transaction.</p>
        </div>
        <div className="grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <PurchaseOrderUpload
            key={`${transactionId}-client-po`}
            title="Client purchase order"
            description="The purchase order received from the client."
            type="clientPO"
            latestFile={latestPurchaseOrders.clientPO}
            busy={uploading === "clientPO"}
            disabled={uploading !== null}
            error={uploadError?.type === "clientPO" ? uploadError.message : undefined}
            onUpload={handleUpload}
          />
          <PurchaseOrderUpload
            key={`${transactionId}-supplier-po`}
            title="Supplier purchase order"
            description="The purchase order issued to the supplier."
            type="supplierPO"
            latestFile={latestPurchaseOrders.supplierPO}
            busy={uploading === "supplierPO"}
            disabled={uploading !== null}
            error={uploadError?.type === "supplierPO" ? uploadError.message : undefined}
            onUpload={handleUpload}
          />
        </div>
      </section>

      <section aria-labelledby="document-list-title" aria-busy={loading} className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-1 border-b bg-secondary px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 id="document-list-title" className="text-base font-semibold text-foreground">File register</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Uploaded files remain private to authenticated IDC Energy users.</p>
          </div>
          <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
            {loading ? "Loading files" : loadError ? "Files unavailable" : fileCountLabel}
          </p>
        </div>

        {actionError ? (
          <div role="alert" className="flex items-start gap-3 border-b bg-[var(--color-destructive-soft)] px-5 py-3 text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm font-medium">{actionError}</p>
          </div>
        ) : null}

        <Table className="min-w-[48rem]" aria-label="Uploaded transaction documents">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">File</TableHead>
              <TableHead scope="col">Category</TableHead>
              <TableHead scope="col">Uploaded by</TableHead>
              <TableHead scope="col">Date</TableHead>
              <TableHead scope="col" className="w-12"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError ? (
              <TableRow className="hover:bg-card">
                <TableCell colSpan={5}>
                  <div role="alert" className="flex flex-col items-center px-4 py-8 text-center">
                    <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
                    <p className="mt-3 font-medium text-foreground">Documents could not be loaded</p>
                    <p className="mt-1 max-w-md whitespace-normal text-sm text-muted-foreground">{loadError}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
                      <RefreshCw aria-hidden="true" />
                      Try again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : loading ? (
              Array.from({ length: 3 }, (_, index) => (
                <TableRow key={index} className="hover:bg-card">
                  <TableCell><div className="flex items-center gap-3"><Skeleton className="size-8" /><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-14" /></div></div></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="size-8" /></TableCell>
                </TableRow>
              ))
            ) : visibleFiles.length === 0 ? (
              <TableRow className="hover:bg-card">
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center px-4 py-10 text-center">
                    <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                      <FileText aria-hidden="true" className="size-5" />
                    </span>
                    <p className="mt-3 font-medium text-foreground">No files uploaded yet</p>
                    <p className="mt-1 max-w-md whitespace-normal text-sm text-muted-foreground">Use the purchase order forms above to add the first document.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visibleFiles.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="max-w-[22rem] whitespace-normal">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">{fileIcon(file.type)}</span>
                      <div className="min-w-0">
                        <p className="break-words font-medium text-foreground">{file.name}</p>
                        {file.size ? <p className="mt-0.5 text-xs text-muted-foreground" data-numeric="true">{file.size}</p> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className={categoryBadgeClass(file.category)}>{file.category}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{file.uploadedBy ?? "User unavailable"}</TableCell>
                  <TableCell className="text-muted-foreground"><time dateTime={file.uploadedAt}>{file.date}</time></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Actions for ${file.name}`}
                          disabled={deletingId === file.id}
                        >
                          {deletingId === file.id ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <MoreHorizontal aria-hidden="true" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => window.location.assign(documentDownloadUrl(transactionId, file.id))}>
                          <Download aria-hidden="true" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void handleDelete(file)}>
                          <Trash2 aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
