import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadIcon, IdCardIcon, PrinterIcon, RefreshCwIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

import { api, type DocumentOwnerType } from "@/lib/api";
import { DetailSection } from "@/components/detail-section";
import { Button } from "@/components/ui/button";

// Shared by student-detail.tsx and staff-detail.tsx -- photo upload/preview
// plus the printable/downloadable QR code, dispatching to the right
// student/staff API pair by ownerType (same convention as DocumentsTab).
export function PersonIdTab({
  ownerType,
  ownerId,
  name,
  canManage,
}: {
  ownerType: DocumentOwnerType;
  ownerId: string;
  name: string;
  canManage: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    const getQr = ownerType === "student" ? api.getStudentQrCode : api.getStaffQrCode;
    const getPhoto = ownerType === "student" ? api.getStudentPhotoUrl : api.getStaffPhotoUrl;
    getQr(ownerId).then((r) => setToken(r.token));
    getPhoto(ownerId).then((r) => setPhotoUrl(r.url));
  }, [ownerType, ownerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFileSelected = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const getUploadUrl = ownerType === "student" ? api.getStudentPhotoUploadUrl : api.getStaffPhotoUploadUrl;
      const setPhoto = ownerType === "student" ? api.setStudentPhoto : api.setStaffPhoto;
      const upload = await getUploadUrl(ownerId, file.name, file.type || "application/octet-stream");
      const res = await fetch(upload.url, {
        method: upload.method,
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      await setPhoto(ownerId, upload.storage_key);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    if (!window.confirm("Remove this photo?")) return;
    const deletePhoto = ownerType === "student" ? api.deleteStudentPhoto : api.deleteStaffPhoto;
    await deletePhoto(ownerId);
    refresh();
  };

  const handleReissue = async () => {
    if (
      !window.confirm(
        "Reissue this QR code? Every previously printed code for this person will stop working immediately.",
      )
    )
      return;
    const reissue = ownerType === "student" ? api.reissueStudentQrCode : api.reissueStaffQrCode;
    const result = await reissue(ownerId);
    setToken(result.token);
  };

  const handleDownload = () => {
    const canvas = qrWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${name.replace(/\s+/g, "-").toLowerCase()}-qr-code.png`;
    a.click();
  };

  return (
    <DetailSection title="ID / QR Code" icon={IdCardIcon}>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-28 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="px-2 text-center text-xs text-muted-foreground">No photo</span>
            )}
          </div>
          {canManage && (
            <div className="flex flex-col items-center gap-1" data-no-print>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
              <Button variant="outline" size="sm" disabled={isUploading} onClick={() => fileRef.current?.click()}>
                <UploadIcon className="size-3.5" />
                {isUploading ? "Uploading..." : photoUrl ? "Replace photo" : "Upload photo"}
              </Button>
              {photoUrl && (
                <Button variant="ghost" size="sm" onClick={handleRemovePhoto}>
                  <Trash2Icon className="size-3.5" />
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>

        <div ref={qrWrapRef} data-print-area className="flex flex-col items-center gap-2">
          {token ? (
            <QRCodeCanvas value={token} size={160} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          <p className="hidden text-center text-sm font-medium print:block">{name}</p>
        </div>

        <div className="flex flex-col gap-2" data-no-print>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={!token}>
            <DownloadIcon className="size-3.5" />
            Download PNG
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!token}>
            <PrinterIcon className="size-3.5" />
            Print
          </Button>
          {canManage && (
            <Button variant="outline" size="sm" onClick={handleReissue} disabled={!token}>
              <RefreshCwIcon className="size-3.5" />
              Reissue QR code
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </DetailSection>
  );
}
