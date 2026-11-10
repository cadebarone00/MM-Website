/**
 * Profile photo crop (owner request 2026-11-02): the person drags / pinches the photo inside a square with a circle guide,
 * and the SQUARE they framed is saved (the app shows it as a circle everywhere). The browser does the cropping, so every
 * upload is a small JPEG the photo API already accepts (lib/profile/profilePhoto.ts: JPG / PNG / WebP, 3 MB) — even when
 * the phone picked a HEIC or a 12 MB original.
 */
export type CropArea = { x: number; y: number; width: number; height: number };

/** The saved photo's side in pixels: never bigger than what was framed, never bigger than 1024. */
export const PHOTO_OUTPUT_MAX = 1024;
export const PHOTO_ZOOM_MAX = 4;

/** Whole-pixel square inside the image (the cropper reports fractions and can touch the edge by a pixel). */
export function squareCrop(area: CropArea, imageWidth: number, imageHeight: number): CropArea {
  const side = Math.max(1, Math.min(Math.round(Math.min(area.width, area.height)), imageWidth, imageHeight));
  const x = Math.min(Math.max(0, Math.round(area.x)), imageWidth - side);
  const y = Math.min(Math.max(0, Math.round(area.y)), imageHeight - side);
  return { x, y, width: side, height: side };
}

export const outputSide = (side: number) => Math.max(1, Math.min(PHOTO_OUTPUT_MAX, Math.round(side)));

/** Browser only: draw the framed square onto a canvas and return it as a JPEG File ready for POST /api/account/photo. */
export async function cropToFile(imageUrl: string, area: CropArea): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't open that photo. Try another one."));
    img.src = imageUrl;
  });
  const square = squareCrop(area, image.naturalWidth, image.naturalHeight);
  const side = outputSide(square.width);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't crop that photo. Try again.");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, square.x, square.y, square.width, square.height, 0, 0, side, side);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Couldn't crop that photo. Try again.");
  return new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
}
