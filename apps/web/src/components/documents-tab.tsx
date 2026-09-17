import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadIcon, PaperclipIcon, Trash2Icon, UploadIcon } from "lucide-react";

import { api, type DocumentOwnerType, type PersonDocument } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { DetailSection } from "@/components/detail-section";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AddDocumentDialog({ ownerType, ownerId, onAdded }: { ownerType: DocumentOwnerType; ownerId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const upload = await api.getDocumentUploadUrl(ownerType, ownerId, file.name, file.type || "application/octet-stream");
      const res = await fetch(upload.url, {
        method: upload.method,
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      await api.createDocument(ownerType, ownerId, {
        label: label.trim() || file.name,
        storage_key: upload.storage_key,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
      });
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadIcon className="size-3.5" />
          Add document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-label">Label</Label>
            <Input id="doc-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Birth certificate" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-file">File</Label>
            <Input id="doc-file" type="file" ref={fileRef} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsTab({ ownerType, ownerId, canManage }: { ownerType: DocumentOwnerType; ownerId: string; canManage: boolean }) {
  const [documents, setDocuments] = useState<PersonDocument[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listDocuments(ownerType, ownerId).then(setDocuments);
  }, [ownerType, ownerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDownload = async (doc: PersonDocument) => {
    setBusyId(doc.id);
    try {
      const { url } = await api.getDocumentDownloadUrl(ownerType, ownerId, doc.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc: PersonDocument) => {
    setBusyId(doc.id);
    try {
      await api.deleteDocument(ownerType, ownerId, doc.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DetailSection
      title="Documents"
      icon={PaperclipIcon}
      actions={canManage && <AddDocumentDialog ownerType={ownerType} ownerId={ownerId} onAdded={refresh} />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">{doc.label}</TableCell>
              <TableCell className="text-muted-foreground">{doc.file_name}</TableCell>
              <TableCell className="text-muted-foreground">{formatFileSize(doc.file_size)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(doc.created_at)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" disabled={busyId === doc.id} onClick={() => handleDownload(doc)}>
                    <DownloadIcon className="size-3.5" />
                  </Button>
                  {canManage && (
                    <Button variant="ghost" size="sm" disabled={busyId === doc.id} onClick={() => handleDelete(doc)}>
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {documents.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No documents uploaded yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </DetailSection>
  );
}
