export type PhoneSize = { width: number; height: number };

export type FitOptions = {
  phone?: PhoneSize;
  gap?: number;
  label?: number;
};

export type FitResult = {
  columns: number;
  rows: number;
  scale: number;
  frame: PhoneSize;
};

const DEFAULT_PHONE: PhoneSize = { width: 390, height: 844 };

// Fixed column count for each phone count, so the shapes read as a box
// (for example 4 is 2×2 and 8 is 4×2). Above 8, use half the count, rounded up.
const COLUMNS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 2,
  5: 3,
  6: 3,
  7: 4,
  8: 4,
};

// Scale is the largest that fits the shape inside the area, capped at 1.
export function fitPhones(
  count: number,
  area: { width: number; height: number },
  opts: FitOptions = {},
): FitResult {
  const phone = opts.phone ?? DEFAULT_PHONE;
  const gap = opts.gap ?? 16;
  const label = opts.label ?? 28;

  if (count <= 0) {
    return { columns: 0, rows: 0, scale: 1, frame: { ...phone } };
  }

  const columns = COLUMNS[count] ?? Math.ceil(count / 2);
  const rows = Math.ceil(count / columns);
  const widthLimit =
    (area.width - (columns - 1) * gap) / (columns * phone.width);
  const heightLimit =
    ((area.height - (rows - 1) * gap) / rows - label) / phone.height;
  // The tiny epsilon keeps exact-fit layouts from overflowing by float noise.
  const fit = Math.min(widthLimit, heightLimit) - 1e-12;
  const scale = Math.max(0, Math.min(1, fit));

  return {
    columns,
    rows,
    scale,
    frame: {
      width: phone.width * scale,
      height: phone.height * scale,
    },
  };
}
