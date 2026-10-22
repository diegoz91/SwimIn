/**
 * Ridimensiona e comprime un'immagine nel browser prima del caricamento:
 * le foto dello smartphone (spesso 4-12 MB) diventano poche centinaia di KB,
 * con caricamenti più rapidi e meno spazio occupato nello storage.
 */
export interface CompressOptions {
    /** Lato più lungo, in pixel. */
    maxSize: number;
    /** Qualità 0-1 per JPEG/WebP. */
    quality?: number;
}

const OUTPUT_TYPE = 'image/jpeg';

const loadImage = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Immagine non leggibile.'));
        };
        img.src = url;
    });

export async function compressImage(file: File, { maxSize, quality = 0.85 }: CompressOptions): Promise<File> {
    // GIF animate e formati non raster: li lasciamo invariati.
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) return file;

    let img: HTMLImageElement;
    try {
        img = await loadImage(file);
    } catch {
        return file;
    }

    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Sfondo bianco: i PNG trasparenti convertiti in JPEG non diventano neri.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, OUTPUT_TYPE, quality));
    if (!blob || blob.size >= file.size) return file; // nessun guadagno: teniamo l'originale

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: OUTPUT_TYPE, lastModified: Date.now() });
}
