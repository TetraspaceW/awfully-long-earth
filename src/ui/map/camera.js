// The map camera: which part of Big Earth is on screen. Positions are in
// sheet units; a sheet is drawn `scale` pixels wide and scale / 2 tall.

export class Camera {
  constructor(cx = 0.5, cy = 0.5, scale = 400) { Object.assign(this, { cx, cy, scale, vw: 0, vh: 0 }); }

  setViewport(vw, vh) { this.vw = vw; this.vh = vh; }

  toScreen(tx, ty) { return [(tx - this.cx) * this.scale + this.vw / 2, (ty - this.cy) * this.scale / 2 + this.vh / 2]; }
  toSheet(sx, sy) { return [(sx - this.vw / 2) / this.scale + this.cx, ((sy - this.vh / 2) * 2) / this.scale + this.cy]; }

  // Zoom by factor f keeping screen point (sx, sy) fixed.
  zoomAt(sx, sy, f) {
    const [tx, ty] = this.toSheet(sx, sy);
    this.scale = Math.max(20, Math.min(4000, this.scale * f));
    const [nx, ny] = this.toSheet(sx, sy);
    this.cx += tx - nx; this.cy += ty - ny;
  }

  panBy(cx0, cy0, dx, dy) {
    this.cx = cx0 - dx / this.scale;
    this.cy = cy0 - (2 * dy) / this.scale;
  }

  defaultScale() { return Math.max(160, Math.min(this.vw / 2.4, this.vh * 2 / 2.4)); }

  centreOn(cx, cy, scale = this.defaultScale()) { Object.assign(this, { cx, cy, scale }); }

  // Fit a box of sheets [x0, x1] x [y0, y1] plus a margin of `pad` sheets.
  fit({ x0, x1, y0, y1 }, pad = 3) {
    const w = x1 - x0 + pad, hgt = y1 - y0 + pad;
    this.centreOn((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, Math.max(20, Math.min(this.vw / w, (2 * this.vh) / hgt)));
  }
}
