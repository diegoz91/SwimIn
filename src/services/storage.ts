import { ID, Permission, Role } from 'appwrite';
import { storage } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { compressImage } from '@/utils/image';
import { uploadFile, type ProgressFn } from '@/services/upload';

const MB = 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/** Dimensioni massime (lato lungo, px) per tipo di immagine. */
export const IMAGE_SIZES = {
  avatar: 800,
  cover: 1920,
  post: 2048,
} as const;

export type ImageKind = keyof typeof IMAGE_SIZES;

class StorageService {
  private buckets = APPWRITE_CONFIG.buckets;

  /**
   * Carica un'immagine del profilo (avatar, logo o copertina) dopo averla
   * ridimensionata. Il file è leggibile da tutti e modificabile solo da chi
   * lo ha caricato (permessi predefiniti di Appwrite per il creatore).
   */
  async uploadProfileImage(file: File, kind: Exclude<ImageKind, 'post'> = 'avatar'): Promise<string> {
    this.validateImageFile(file, 15);
    const compressed = await compressImage(file, { maxSize: IMAGE_SIZES[kind] });
    const uploaded = await storage.createFile(this.buckets.avatars, ID.unique(), compressed);
    return this.viewUrl(this.buckets.avatars, uploaded.$id);
  }

  /**
   * Documento di un brevetto (foto o PDF) nel bucket privato: leggibile solo da chi
   * lo carica e dal server, che lo mostra agli amministratori per la verifica.
   */
  async uploadCertificateDocument(file: File, userId: string): Promise<string> {
    const isPdf = file.type === 'application/pdf';
    if (!isPdf && !IMAGE_TYPES.includes(file.type)) throw new Error('Carica una foto (JPG, PNG, WebP) o un PDF del brevetto.');
    if (file.size > 8 * MB) throw new Error('Il file supera gli 8 MB: prova con una foto meno pesante.');
    const toUpload = isPdf ? file : await compressImage(file, { maxSize: 2000 });
    const uploaded = await storage.createFile(this.buckets.certificates, ID.unique(), toUpload, [Permission.read(Role.user(userId)), Permission.delete(Role.user(userId))]);
    return uploaded.$id;
  }

  /** @deprecated usa uploadProfileImage */
  async uploadAvatar(file: File, _userId?: string): Promise<string> {
    return this.uploadProfileImage(file, 'avatar');
  }

  /** Carica foto o video di un post. Le foto vengono ridimensionate. */
  async uploadPostMedia(file: File, onProgress?: ProgressFn): Promise<string> {
    let toUpload = file;
    if (file.type.startsWith('image/')) {
      this.validateImageFile(file, 20);
      toUpload = await compressImage(file, { maxSize: IMAGE_SIZES.post });
    } else if (file.type.startsWith('video/')) {
      this.validateVideoFile(file, 50);
    } else {
      throw new Error('Tipo di file non supportato. Puoi caricare solo immagini o video.');
    }
    const uploaded = await uploadFile(this.buckets.postMedia, toUpload, undefined, onProgress);
    return this.viewUrl(this.buckets.postMedia, uploaded.$id);
  }

  /**
   * Elimina un file a partire dal suo URL pubblico, se appartiene al nostro
   * storage. Errori ignorati (file già eliminato o di un altro utente): la
   * pulizia non deve bloccare l'azione principale.
   */
  async deleteByUrl(url?: string | null): Promise<void> {
    const ref = parseFileUrl(url);
    if (!ref) return;
    try {
      await storage.deleteFile(ref.bucketId, ref.fileId);
    } catch (error) {
      console.warn('File non eliminato:', ref, error);
    }
  }

  private viewUrl(bucketId: string, fileId: string): string {
    return storage.getFileView(bucketId, fileId).toString();
  }

  private validateImageFile(file: File, maxSizeMB: number) {
    if (!IMAGE_TYPES.includes(file.type)) {
      throw new Error('Formato immagine non supportato. Usa JPG, PNG o WebP.');
    }
    if (file.size > maxSizeMB * MB) {
      throw new Error(`Immagine troppo grande. Il limite è ${maxSizeMB} MB.`);
    }
  }

  private validateVideoFile(file: File, maxSizeMB: number) {
    if (!VIDEO_TYPES.includes(file.type)) {
      throw new Error('Formato video non supportato. Usa MP4, MOV o WebM.');
    }
    if (file.size > maxSizeMB * MB) {
      throw new Error(`Video troppo grande. Il limite è ${maxSizeMB} MB.`);
    }
  }
}

/** Estrae bucket e file da un URL del tipo …/storage/buckets/{bucket}/files/{file}/view… */
export function parseFileUrl(url?: string | null): { bucketId: string; fileId: string } | null {
  if (!url || !APPWRITE_CONFIG.endpoint || !url.startsWith(APPWRITE_CONFIG.endpoint)) return null;
  const match = url.match(/\/storage\/buckets\/([^/]+)\/files\/([^/?]+)/);
  return match ? { bucketId: match[1], fileId: match[2] } : null;
}

export const storageService = new StorageService();
