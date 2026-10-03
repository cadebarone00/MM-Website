export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; color: string; width: number; highlight: boolean };

/** Coordinates and width are relative to the viewport, independent of display zoom/DPR. */
export function annotationPoint(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): Point {
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) };
}

export function paintAnnotations(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    const points = stroke.points.map(p => ({ x: p.x * width, y: p.y * height }));
    if (!points.length) continue;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = stroke.color;
    ctx.globalAlpha = stroke.highlight ? 0.32 : 1;
    ctx.lineWidth = stroke.width * Math.min(width, height);
    ctx.lineCap = ctx.lineJoin = "round";
    // One path per stroke prevents highlighter opacity building up at each pointer sample.
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        ctx.quadraticCurveTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2, (points[i].y + points[i + 1].y) / 2);
      }
      ctx.lineTo(points.at(-1)!.x, points.at(-1)!.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Segment hit testing also catches a fast eraser that crosses between pointer samples. */
export function strokeHit(stroke: Stroke, from: Point, to: Point, width: number, height: number, radius: number) {
  const pixel = (p: Point): Point => ({ x: p.x * width, y: p.y * height });
  const a = pixel(from), b = pixel(to);
  const distance = (p: Point, start: Point, end: Point) => {
    const dx = end.x - start.x, dy = end.y - start.y;
    const t = Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - start.x - t * dx, p.y - start.y - t * dy);
  };
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const tolerance = radius + stroke.width * Math.min(width, height) / 2;
  return stroke.points.some((point, i) => {
    const c = pixel(point), d = pixel(stroke.points[Math.max(0, i - 1)]);
    const intersects = cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
    return intersects || Math.min(distance(c, a, b), distance(d, a, b), distance(a, c, d), distance(b, c, d)) <= tolerance;
  });
}
