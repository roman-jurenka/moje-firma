// ─── Vyrovnání perspektivy fotky stěny ───────────────────────────────────────
// Uživatel na fotce označí 4 rohy stěny (levý dolní, pravý dolní, pravý horní,
// levý horní — horní rohy ve výšce okapu). Z nich se spočítá homografie mezi
// rovinou stěny (metry) a fotkou (pixely) a fotka se přepočítá na „čelní“
// pohled, který se pak napne na stěnu modelu. Štít nad okapem se dopočítá
// stejnou homografií (je ve stejné rovině jako stěna).

// Homografie H (3×3, h33 = 1) taková, že H·[x, y, 1] ~ [u, v, 1].
export function homografie(z, na) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = z[i], [u, v] = na[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussova eliminace s výběrem hlavního prvku
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j < 8; j++) A[r][j] -= k * A[c][j];
      b[r] -= k * b[c];
    }
  }
  const h = b.map((x, i) => x / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

const nactiObrazek = (data) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = rej;
  img.src = data;
});

// Vrátí canvas s narovnanou stěnou: šířka odpovídá délce stěny, výška maxT.
// rohy: [[u, v] × 4] v poměru 0–1 k rozměru fotky; tL, tR = výška okapu na rozích.
export async function vyrovnejFotku(data, rohy, delka, tL, tR, maxT) {
  const img = await nactiObrazek(data);
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const src = document.createElement("canvas");
  src.width = sw; src.height = sh;
  const sctx = src.getContext("2d");
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, sw, sh).data;

  const H = homografie([[0, 0], [delka, 0], [delka, tR], [0, tL]], rohy.map(([u, v]) => [u * sw, v * sh]));
  const W = 1024;
  const Hc = Math.max(64, Math.min(2048, Math.round((W * maxT) / delka)));
  const out = document.createElement("canvas");
  out.width = W; out.height = Hc;
  const octx = out.getContext("2d");
  const od = octx.createImageData(W, Hc);
  const o = od.data;
  if (H) {
    for (let j = 0; j < Hc; j++) {
      const t = maxT * (1 - (j + 0.5) / Hc);
      for (let i = 0; i < W; i++) {
        const s = ((i + 0.5) / W) * delka;
        const w = H[6] * s + H[7] * t + 1;
        const u = (H[0] * s + H[1] * t + H[2]) / w - 0.5, v = (H[3] * s + H[4] * t + H[5]) / w - 0.5;
        const k = (j * W + i) * 4;
        if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) { o[k] = 236; o[k + 1] = 230; o[k + 2] = 218; o[k + 3] = 255; continue; }
        const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
        const a = (y0 * sw + x0) * 4, bb = a + 4, c = a + sw * 4, d = c + 4;
        for (let ch = 0; ch < 3; ch++) {
          o[k + ch] = (sd[a + ch] * (1 - fx) + sd[bb + ch] * fx) * (1 - fy) + (sd[c + ch] * (1 - fx) + sd[d + ch] * fx) * fy;
        }
        o[k + 3] = 255;
      }
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}
