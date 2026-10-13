// Thermal receipts are printed as a single raster image rather than as
// printer text: ESC/POS printers ship without a Khmer font, so the whole
// receipt is drawn onto a canvas in Kantumruy Pro (same as the UI), turned
// into 1-bit pixels and sent with the GS v 0 raster command.

// 58mm paper: 48mm printable at 203 dpi = 384 dots, 8 dots per byte.
const PAPER_WIDTH_DOTS = 384;
const BAND_HEIGHT_DOTS = 255;
const MARGIN = 4;
const FONT_FAMILY = '"Kantumruy Pro", sans-serif';
// Khmer stacks vowels and subscripts above and below the base line, so lines
// need far more room than Latin text alone would.
const LINE_HEIGHT_RATIO = 1.55;
const BASELINE_RATIO = 1.1;
// Below this luminance a pixel prints black - slightly above mid-grey so the
// antialiased edges of thin Khmer strokes don't drop out.
const INK_THRESHOLD = 160;

const FONT_SIZES = { small: 18, normal: 22, large: 30 } as const;

type FontSize = keyof typeof FONT_SIZES;

export type ReceiptBlock =
  | { type: "text"; text: string; align?: "left" | "center"; size?: FontSize; bold?: boolean; indent?: number }
  | { type: "row"; left: string; right: string; size?: FontSize; bold?: boolean }
  | { type: "divider" }
  | { type: "spacer"; height: number };

interface DrawOp {
  text: string;
  x: number;
  y: number;
  font: string;
  align: CanvasTextAlign;
}

function fontFor(size: FontSize = "normal", bold = false): string {
  return `${bold ? 700 : 400} ${FONT_SIZES[size]}px ${FONT_FAMILY}`;
}

// The Khmer and Latin subsets are separate unicode-range faces that only
// download on first use - make sure both weights are ready before drawing,
// or the canvas silently falls back to a system font.
export async function loadReceiptFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load(fontFor("normal", false), "កA0"),
    document.fonts.load(fontFor("normal", true), "កA0"),
  ]);
}

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Khmer writes words without spaces, so wrapping goes by ICU word segments
// (not spaces), falling back to grapheme clusters for a single segment that
// is wider than the line by itself.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";

  const pushPiece = (piece: string) => {
    const candidate = current + piece;
    if (ctx.measureText(candidate).width <= maxWidth || current === "") {
      current = candidate;
      return;
    }
    lines.push(current.trimEnd());
    current = piece.trimStart();
  };

  for (const { segment } of wordSegmenter.segment(text)) {
    if (ctx.measureText(segment).width <= maxWidth) {
      pushPiece(segment);
      continue;
    }
    for (const { segment: grapheme } of graphemeSegmenter.segment(segment)) {
      pushPiece(grapheme);
    }
  }

  if (current.trim() !== "" || lines.length === 0) {
    lines.push(current.trimEnd());
  }
  return lines;
}

function layout(ctx: CanvasRenderingContext2D, blocks: ReceiptBlock[]): { ops: DrawOp[]; dividers: number[]; height: number } {
  const ops: DrawOp[] = [];
  const dividers: number[] = [];
  const contentWidth = PAPER_WIDTH_DOTS - MARGIN * 2;
  let y = MARGIN;

  for (const block of blocks) {
    if (block.type === "spacer") {
      y += block.height;
      continue;
    }

    if (block.type === "divider") {
      dividers.push(y + 8);
      y += 17;
      continue;
    }

    const size = FONT_SIZES[block.size ?? "normal"];
    const lineHeight = Math.round(size * LINE_HEIGHT_RATIO);
    const baseline = Math.round(size * BASELINE_RATIO);
    const font = fontFor(block.size, block.bold);
    ctx.font = font;

    if (block.type === "text") {
      const indent = block.indent ?? 0;
      const isCenter = block.align === "center";
      for (const line of wrapText(ctx, block.text, contentWidth - indent)) {
        ops.push({
          text: line,
          x: isCenter ? PAPER_WIDTH_DOTS / 2 : MARGIN + indent,
          y: y + baseline,
          font,
          align: isCenter ? "center" : "left",
        });
        y += lineHeight;
      }
      continue;
    }

    // Row: the right-hand value (an amount) never wraps; the left label wraps
    // in whatever width remains, with the value on its first line.
    const rightWidth = ctx.measureText(block.right).width;
    const leftLines = wrapText(ctx, block.left, contentWidth - rightWidth - 12);
    ops.push({ text: block.right, x: PAPER_WIDTH_DOTS - MARGIN, y: y + baseline, font, align: "right" });
    for (const line of leftLines) {
      ops.push({ text: line, x: MARGIN, y: y + baseline, font, align: "left" });
      y += lineHeight;
    }
  }

  return { ops, dividers, height: y + MARGIN };
}

export function renderReceipt(blocks: ReceiptBlock[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PAPER_WIDTH_DOTS;
  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) {
    throw new Error("Canvas 2D context unavailable");
  }

  const { ops, dividers, height } = layout(measureCtx, blocks);

  // Resizing resets the context, so draw with a fresh one afterwards.
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";

  for (const op of ops) {
    ctx.font = op.font;
    ctx.textAlign = op.align;
    ctx.fillText(op.text, op.x, op.y);
  }

  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  for (const dividerY of dividers) {
    ctx.beginPath();
    ctx.moveTo(MARGIN, dividerY);
    ctx.lineTo(PAPER_WIDTH_DOTS - MARGIN, dividerY);
    ctx.stroke();
  }

  return canvas;
}

// ESC @ (reset), the image as GS v 0 raster bands, then feed past the tear
// bar and cut. Printers without a cutter ignore the cut command.
export function encodeEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);

  const chunks: number[][] = [[0x1b, 0x40]];

  for (let bandTop = 0; bandTop < height; bandTop += BAND_HEIGHT_DOTS) {
    const bandHeight = Math.min(BAND_HEIGHT_DOTS, height - bandTop);
    const band = [0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, bandHeight & 0xff, bandHeight >> 8];

    for (let y = bandTop; y < bandTop + bandHeight; y++) {
      for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteIndex * 8 + bit;
          if (x >= width) {
            continue;
          }
          const offset = (y * width + x) * 4;
          const luminance = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
          if (luminance < INK_THRESHOLD) {
            byte |= 0x80 >> bit;
          }
        }
        band.push(byte);
      }
    }
    chunks.push(band);
  }

  chunks.push([0x1b, 0x64, 0x04], [0x1d, 0x56, 0x42, 0x00]);
  return Uint8Array.from(chunks.flat());
}
