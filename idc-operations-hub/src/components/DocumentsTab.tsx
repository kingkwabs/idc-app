import { useEffect, useState } from "react";
import { Upload, FileText, Download, MoreHorizontal, CheckCircle, Image as ImageIcon, File } from "lucide-react";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Badge } from "./ui/badge";
import { listDocuments, uploadDocument, updateRefs, documentDownloadUrl, deleteDocument } from "../lib/api";

interface UploadedFile {
  id: string | number;
  name: string;
  category: "Client PO" | "Supplier PO" | "Invoice" | "Other";
  uploadedBy?: string;
  date?: string;
  type?: "pdf" | "image" | "document";
  size?: string;
}

interface UploadState {
  clientPO: {
    uploaded: boolean;
    fileName?: string;
    poNumber?: string;
  };
  supplierPO: {
    uploaded: boolean;
    fileName?: string;
    poNumber?: string;
  };
}

function uiCategoryToApi(category: "Client PO" | "Supplier PO" | "Invoice" | "Other") {
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

function apiCategoryToUi(category?: string): UploadedFile["category"] {
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

interface DocumentsTabProps {
  transactionId: number;
}

export function DocumentsTab({ transactionId }: DocumentsTabProps) {
  const [uploadState, setUploadState] = useState<UploadState>({
    clientPO: { uploaded: false },
    supplierPO: { uploaded: false },
  });

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listDocuments(transactionId);
      const mapped: UploadedFile[] = res.items.map((d) => ({
        id: d.id,
        name: d.name,
        category: apiCategoryToUi(d.category),
        uploadedBy: d.uploaded_by,
        date: new Date(d.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        size: typeof d.size_bytes === 'number' && d.size_bytes >= 0 ? `${(d.size_bytes / 1024).toFixed(1)} KB` : undefined,
        type: d.mime_type?.includes('pdf') ? 'pdf' : d.mime_type?.startsWith('image/') ? 'image' : 'document',
      }));
      setFiles(mapped);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [transactionId]);

  const getFileIcon = (type?: string) => {
    switch (type) {
      case "pdf":
        return <FileText className="h-4 w-4 text-red-500" />;
      case "image":
        return <ImageIcon className="h-4 w-4 text-blue-500" />;
      default:
        return <File className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleFileUpload = async (type: 'clientPO' | 'supplierPO', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    let poPromptLabel = type === 'clientPO' ? 'Client PO Number' : 'Supplier PO Number';
    const poNumber = window.prompt(`Enter ${poPromptLabel}:`);
    if (!poNumber || !poNumber.trim()) {
      return; // require PO number
    }

    const toBase64 = (f: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string; // data:*/*;base64,....
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

    const content_base64 = await toBase64(file);

    await uploadDocument(transactionId, {
      category: uiCategoryToApi(type === 'clientPO' ? 'Client PO' : 'Supplier PO'),
      name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      content_base64,
      uploaded_by: 'Current User',
    });

    // Update refs accordingly
    if (type === 'clientPO') {
      await updateRefs(transactionId, { client_po_number: poNumber.trim() });
    } else {
      await updateRefs(transactionId, { supplier_po_number: poNumber.trim() });
    }

    setUploadState(prev => ({
      ...prev,
      [type]: {
        uploaded: true,
        fileName: file.name,
        poNumber: poNumber.trim()
      }
    }));

    await load();
  };

  const UploadComponent = ({ 
    title, 
    type, 
    uploaded, 
    fileName, 
    poNumber 
  }: { 
    title: string; 
    type: 'clientPO' | 'supplierPO';
    uploaded: boolean;
    fileName?: string;
    poNumber?: string;
  }) => {
    if (uploaded && fileName) {
      return (
        <div className="glass-card rounded-lg p-6 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative z-10 space-y-4">
            <h3 className="font-medium text-gray-900">{title}</h3>
            
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <FileText className="h-8 w-8 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{fileName}</p>
                {poNumber && (
                  <p className="text-sm text-gray-600">PO Number: {poNumber}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600 font-medium">Status: Uploaded</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="glass-card rounded-lg p-6 hover:shadow-xl transition-all duration-300 relative overflow-hidden group border-2 border-dashed border-gray-300">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="relative z-10 text-center space-y-4">
          <h3 className="font-medium text-gray-900 mb-4">{title}</h3>
          
          <div className="space-y-3">
            <Upload className="h-12 w-12 text-gray-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-gray-600">Drag & drop file or click to upload</p>
            </div>
          </div>
          
          <div className="pt-2">
            <p className="text-sm text-gray-500">Status: Not yet uploaded</p>
          </div>
          
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={(e) => handleFileUpload(type, e)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-8">Documents</h2>
        
        {/* Upload Components */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <UploadComponent
            title="Client Purchase Order"
            type="clientPO"
            uploaded={uploadState.clientPO.uploaded}
            fileName={uploadState.clientPO.fileName}
            poNumber={uploadState.clientPO.poNumber}
          />
          
          <UploadComponent
            title="Supplier Purchase Order"
            type="supplierPO"
            uploaded={uploadState.supplierPO.uploaded}
            fileName={uploadState.supplierPO.fileName}
            poNumber={uploadState.supplierPO.poNumber}
          />
        </div>

        {/* Documents List */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">All Uploaded Files</h3>
          
          <div className="glass-table rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300">
            <Table>
              <TableHeader>
                <TableRow className="bg-white/30 backdrop-blur-sm">
                  <TableHead className="font-medium text-gray-900">File Name</TableHead>
                  <TableHead className="font-medium text-gray-900">Category</TableHead>
                  <TableHead className="font-medium text-gray-900">Uploaded By</TableHead>
                  <TableHead className="font-medium text-gray-900">Date</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-gray-500">Loading...</TableCell></TableRow>
                ) : files.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-gray-500">No documents.</TableCell></TableRow>
                ) : (
                  files.map((file) => (
                    <TableRow key={file.id} className="hover:bg-white/40 transition-all duration-200">
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          {getFileIcon(file.type)}
                          <div>
                            <span className="font-medium">{file.name}</span>
                            {file.size && (
                              <p className="text-xs text-gray-500">{file.size}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={`
                            backdrop-blur-sm border 
                            ${file.category === 'Client PO' ? 'bg-blue-500/90 text-white border-blue-400/30' : ''}
                            ${file.category === 'Supplier PO' ? 'bg-green-500/90 text-white border-green-400/30' : ''}
                            ${file.category === 'Invoice' ? 'bg-purple-500/90 text-white border-purple-400/30' : ''}
                            ${file.category === 'Other' ? 'bg-gray-500/90 text-white border-gray-400/30' : ''}
                          `}
                        >
                          {file.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{file.uploadedBy || '—'}</TableCell>
                      <TableCell className="font-medium">{file.date || '—'}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="glass backdrop-blur-sm">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => {
                              if (typeof file.id === 'number') {
                                window.location.href = documentDownloadUrl(transactionId, file.id);
                              }
                            }}>
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-red-600" onClick={async () => {
                              if (typeof file.id !== 'number') return;
                              const confirmed = window.confirm(`Delete ${file.name}? This cannot be undone.`);
                              if (!confirmed) return;
                              try {
                                await deleteDocument(transactionId, file.id);
                                await load();
                              } catch (e) {
                                console.error(e);
                                alert('Failed to delete document');
                              }
                            }}>
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
          </div>
        </div>
      </div>
    </div>
  );
}