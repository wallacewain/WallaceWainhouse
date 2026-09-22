/*  The space behind the written part of the page.
 *
 *  A cavern of vertical columns you travel down as you scroll. It is meant to
 *  read as reverb phasing in a room: the columns beat against each other on
 *  two close rates, the way two reflections arriving a few milliseconds apart
 *  do, and the shimmer is the same glint effect the splash uses.
 *
 *  It is a real camera, not a scatter.
 *
 *  The first version placed things at random screen positions with a random
 *  "depth" that only scaled them, and it looked like litter - worst of all
 *  near the camera, where random big things sit in front of everything and
 *  none of them agree about where they are. Nothing converged, so nothing read
 *  as space. Now every column has a position in metres, the camera flies down
 *  the z axis as the page scrolls, and the projection does the rest: far
 *  columns crowd toward the vanishing point and thin out, near ones sweep past
 *  the edges. Structure first, then dressing.
 *
 *  Still a 2D canvas on purpose. The splash already owns a GPU context and the
 *  rack is the expensive thing on this page, so: one pre-rendered sprite for
 *  every soft edge, lines for everything else, and nothing drawn at all while
 *  the writing is off screen.
 */
const cv = document.getElementById("cave");
if (cv) {
  const ctx = cv.getContext("2d", { alpha: true });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const BG = "#0e0e10";
  const WARM = [255, 181, 116];
  const COOL = [150, 170, 200];

  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // --- the room, in metres -------------------------------------------------
  const Z_NEAR = 2.2;          // nearer than this is clipped
  const Z_FAR = 62;            // and fogged out well before here
  const Z_SPAN = Z_FAR - Z_NEAR;
  const WALL = 4.6;            // half-width of the passage
  const HIGH = 3.1;            // half-height

  // Columns stand in two loose ranks along the walls, with a few strays
  // between them. Ranks are what make it a passage; strays are what stop it
  // being a corridor in a game.
  const COLUMNS = 210;
  const columns = Array.from({ length: COLUMNS }, (_, i) => {
    const stray = rnd() < 0.22;
    const side = i % 2 ? 1 : -1;
    const x = stray
      ? (rnd() * 2 - 1) * WALL * 0.85
      : side * (WALL * (0.82 + rnd() * 0.5));
    return {
      x,
      z0: rnd() * Z_SPAN,
      w: 0.05 + rnd() * (stray ? 0.09 : 0.20),   // metres thick
      top: HIGH * (0.55 + rnd() * 0.75),
      bot: -HIGH * (0.55 + rnd() * 0.75),
      warm: rnd() < 0.45,
      beat: 0.09 + rnd() * 0.5,
      phase: rnd() * Math.PI * 2,
    };
  });

  // Bokeh lives in the same room, so its size comes from its distance rather
  // than from a random number - which is the whole reason the near ones stop
  // looking like clutter.
  const MOTES = 120;
  const motes = Array.from({ length: MOTES }, () => ({
    x: (rnd() * 2 - 1) * WALL * 1.5,
    y: (rnd() * 2 - 1) * HIGH * 1.25,
    z0: rnd() * Z_SPAN,
    r: 0.02 + rnd() * 0.16,                       // metres
    warm: rnd() < 0.72,
    a: 0.35 + rnd() * 0.65,
    beat: 0.07 + rnd() * 0.35,
    phase: rnd() * Math.PI * 2,
  }));

  // The shimmer: the splash's glints, on the scroll axis. Each waits for its
  // own place on the page and brightens as you pass it.
  const GLINTS = 380;
  const glints = Array.from({ length: GLINTS }, () => ({
    x: (rnd() * 2 - 1) * WALL * 1.2,
    y: (rnd() * 2 - 1) * HIGH * 1.1,
    z: Z_NEAR + 2 + rnd() * (Z_SPAN - 6),
    at: rnd(),
    sigma: 0.010 + rnd() * 0.045,
    r: 0.012 + rnd() * 0.05,
    a: 0.5 + rnd() * 0.5,
    warm: rnd() < 0.8,
  }));

  // --- one soft sprite, drawn at every size --------------------------------
  function disc(colour) {
    const s = 128;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0.0, rgba(colour, 1));
    grd.addColorStop(0.4, rgba(colour, 0.3));
    grd.addColorStop(1.0, rgba(colour, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return c;
  }
  const discWarm = disc(WARM);
  const discCool = disc(COOL);

  // --- camera --------------------------------------------------------------
  let W = 0, H = 0, dpr = 1, focal = 0;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    focal = Math.max(W, H) * 0.62;
  }
  addEventListener("resize", resize);
  resize();

  // Fog, and the fade that keeps anything arriving at the near plane from
  // popping into existence in your face.
  const fog = (z) => Math.exp(-Math.max(0, z - 6) / 26);
  const nearFade = (z) => Math.min(1, Math.max(0, (z - Z_NEAR) / 5.5));

  const doc = document.querySelector(".doc");
  const stage = document.getElementById("stage");

  // Half rate. This drifts slowly and is behind text; nobody has ever looked
  // at a background and wanted more frames out of it, and the splash is
  // already holding a GPU context open on the same thread.
  const MIN_FRAME_MS = 1000 / 30;
  let lastDrawn = -1e9;

  function draw(t) {
    const top = doc ? doc.getBoundingClientRect().top : H;
    const total = Math.max(1, (doc ? doc.offsetHeight : H) - H);
    const into = Math.min(1, Math.max(0, -top / total));
    const reveal = Math.min(1, Math.max(0, (H - top) / (H * 0.85)));
    cv.style.opacity = reveal.toFixed(3);

    // Once the cave covers it, the splash is painting a scene nobody can see.
    // Hiding it lets the compositor drop it; layers.js keeps its own loop, but
    // there is no reason to composite a hidden rack on every frame.
    if (stage) stage.style.visibility = reveal >= 0.995 ? "hidden" : "visible";

    if (reveal <= 0.001) return;
    if (t - lastDrawn < MIN_FRAME_MS) return;
    lastDrawn = t;

    // Scrolling flies the camera down the passage.
    const travel = (-top) * 0.016;
    const time = reduced ? 0 : t * 0.001;
    const cx = W / 2, cy = H / 2;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    // --- columns -----------------------------------------------------------
    for (const c of columns) {
      let z = (c.z0 - travel) % Z_SPAN;
      if (z < 0) z += Z_SPAN;
      z += Z_NEAR;

      const k = focal / z;
      const sx = cx + c.x * k;
      if (sx < -60 || sx > W + 60) continue;

      const yTop = cy - c.top * k;
      const yBot = cy - c.bot * k;
      const lw = Math.max(0.5, c.w * k);

      // Two close rates, beating. One sine is a pulse; two is phasing.
      const b = 0.5 + 0.5 * Math.sin(time * c.beat + c.phase)
                    * Math.sin(time * c.beat * 1.13 + c.phase * 1.7);
      const a = 0.42 * fog(z) * nearFade(z) * (0.35 + 0.65 * b);
      if (a < 0.004) continue;

      const col = c.warm ? WARM : COOL;
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.5, rgba(col, a));
      g.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(sx, yTop);
      ctx.lineTo(sx, yBot);
      ctx.stroke();
    }

    // --- motes -------------------------------------------------------------
    for (const m of motes) {
      let z = (m.z0 - travel) % Z_SPAN;
      if (z < 0) z += Z_SPAN;
      z += Z_NEAR;

      const k = focal / z;
      const sx = cx + m.x * k;
      const sy = cy - m.y * k;
      const r = m.r * k;
      if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;

      const b = 0.55 + 0.45 * Math.sin(time * m.beat + m.phase);
      // Out of focus close up, so a near mote is a wide dim wash rather than
      // a bright blob sitting on top of the picture.
      const focusFade = Math.min(1, z / 7);
      const a = m.a * 0.22 * fog(z) * nearFade(z) * b * focusFade;
      if (a < 0.004) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(m.warm ? discWarm : discCool, sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    // --- the shimmer -------------------------------------------------------
    for (const gl of glints) {
      const d = (into - gl.at) / gl.sigma;
      const kk = Math.exp(-d * d);
      if (kk < 0.04) continue;

      let z = (gl.z - travel) % Z_SPAN;
      if (z < 0) z += Z_SPAN;
      z += Z_NEAR;

      const k = focal / z;
      const sx = cx + gl.x * k;
      const sy = cy - gl.y * k;
      const r = Math.max(1.2, gl.r * k) * (1 + 1.6 * kk);
      if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;

      ctx.globalAlpha = Math.min(1, gl.a * kk * fog(z));
      ctx.drawImage(gl.warm ? discWarm : discCool, sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  let running = false, raf = 0;
  function loop(t) { draw(t); raf = requestAnimationFrame(loop); }
  function start() { if (!running) { running = true; raf = requestAnimationFrame(loop); } }
  function stop() { if (running) { running = false; cancelAnimationFrame(raf); } }

  if (doc && "IntersectionObserver" in window) {
    new IntersectionObserver((es) => (es[0].isIntersecting ? start() : stop()),
                             { rootMargin: "200px" }).observe(doc);
  } else {
    start();
  }

  if (reduced) {
    stop();
    addEventListener("scroll", () => draw(0), { passive: true });
    draw(0);
  }
}
