export interface PresignedUpload {
  url: string;
  method: "PUT";
  expires_at: string;
}

export interface PresignedDownload {
  url: string;
  expires_at: string;
}

export interface StorageDriver {
  createUploadUrl(key: string, contentType: string): Promise<PresignedUpload> | PresignedUpload;
  createDownloadUrl(key: string): Promise<PresignedDownload> | PresignedDownload;
  deleteObject(key: string): Promise<void>;
}
