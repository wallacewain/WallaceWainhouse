/*  The background behind the written part of the page.
 *
 *  An abstract cave: vertical strands at different depths, bokeh floating
 *  between them, and the shimmer from the splash. It is meant to read as
 *  reverb phasing in a space rather than as a picture of anything - the
 *  strands beat against each other, slowly, the way two close reflections do.
 *
 *  Deliberately a 2D canvas and not a second WebGL scene. The splash already
 *  owns a GPU context and the rack is the expensive thing on this page; this
 *  has to cost almost nothing or it is not worth having. So:
 *
 *    - every soft thing is one pre-rendered sprite, drawn many times at
 *      different scales, which is where the bokeh comes from for free;
 *    - strands are plain lines with a gradient cached per depth band;
 *    - nothing is drawn at all while the written part is off screen.
 *
 *  The shimmer is the glint effect from the splash, moved from one axis to
 *  another. There, each point has a preferred camera angle and brightens as
 *  the camera passes it. Here, each point has a preferred scroll position and
 *  brightens as you scroll past it - same gaussian, same warmth, same habit of
 *  showing up strongest in the dark parts. See the splash's makeGlints.
 */
const cv = document.getElementById("cave");
if (cv) {
  const ctx = cv.getContext("2d", { alpha: true });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const BG = "#0e0e10";
  const WARM = [255, 181, 116];
  const COOL = [150, 170, 200];

  // One seeded generator, so the cave is the same cave on every visit.
  let seed = 0x9e3779b9;
  const rnd = () => (((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296));

  const lerp = (a, b, t) => a + (b - a) * t;
  const rgba = (c, a) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

  // --- the cast ------------------------------------------------------------
  // z is depth: 0 is against your face, 1 is the far wall. Everything about a
  // thing - how wide, how bright, how fast it slides past - follows from it.
  const STRANDS = 150;
  const strands = Array.from({ length: STRANDS }, () => {
    const z = 0.18 + Math.pow(rnd(), 0.7) * 0.82;
    // Pushed away from the middle, so the eye reads a passage rather than a
    // curtain: the near strands stand at the sides like walls closing in.
    const edge = Math.pow(rnd(), 1.0 + (1.0 - z) * 2.2);
    return {
      z,
      x: 0.5 + (rnd() < 0.5 ? -1 : 1) * edge * 0.62,
      w: lerp(6.5, 0.8, z),
      a: lerp(0.62, 0.18, z),
      warm: rnd(),
      beat: 0.10 + rnd() * 0.55,     // how fast this one drifts in and out
      phase: rnd() * Math.PI * 2,
      span: 0.35 + rnd() * 0.9,      // fraction of the screen it reaches over
      off: rnd(),
    };
  });

  const BOKEH = 110;
  const bokeh = Array.from({ length: BOKEH }, () => {
    const z = 0.12 + Math.pow(rnd(), 1.4) * 0.88;
    return {
      z,
      x: rnd(),
      y: rnd(),
      r: lerp(110, 9, z) * (0.5 + rnd()),
      a: lerp(0.42, 0.10, z),
      warm: Math.pow(rnd(), 0.6),
      beat: 0.08 + rnd() * 0.4,
      phase: rnd() * Math.PI * 2,
    };
  });

  // The shimmer. Each one waits for its own place on the page.
  const GLINTS = 420;
  const glints = Array.from({ length: GLINTS }, () => ({
    x: rnd(),
    at: rnd(),                       // preferred scroll, 0..1 of the article
    sigma: 0.012 + rnd() * 0.05,
    y: rnd(),
    r: 0.7 + rnd() * 2.2,
    a: 0.55 + rnd() * 0.85,
    warm: Math.pow(rnd(), 0.4),
  }));

  // --- sprites -------------------------------------------------------------
  // A soft disc, drawn once, scaled for everything blurry. Two of them, warm
  // and cool, so the tint does not cost a second gradient per draw.
  function disc(colour) {
    const s = 128;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0.0, rgba(colour, 1));
    grd.addColorStop(0.45, rgba(colour, 0.35));
    grd.addColorStop(1.0, rgba(colour, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return c;
  }
  const discWarm = disc(WARM);
  const discCool = disc(COOL);

  // --- sizing --------------------------------------------------------------
  let W = 0, H = 0, dpr = 1;
  function resize() {
    // Capped: this is a background, and a background is not worth four times
    // the pixels on a high-density screen.
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  // --- the frame -----------------------------------------------------------
  const doc = document.querySelector(".doc");

  function draw(t) {
    const top = doc ? doc.getBoundingClientRect().top : H;

    // How far into the written part we are, 0 at its first pixel and 1 at the
    // end. Also what fades the cave up over the splash, so the two do not both
    // claim the screen at once.
    const total = Math.max(1, (doc ? doc.offsetHeight : H) - H);
    const into = Math.min(1, Math.max(0, -top / total));
    const reveal = Math.min(1, Math.max(0, (H - top) / (H * 0.85)));
    cv.style.opacity = reveal.toFixed(3);
    if (reveal <= 0.001) return;

    const p = -top;                                  // pixels scrolled into it
    const time = reduced ? 0 : t * 0.001;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // --- strands ---------------------------------------------------------
    ctx.globalCompositeOperation = "lighter";
    for (const s of strands) {
      // Parallax: the near ones sweep, the far ones barely move.
      const slide = (p * (0.22 / s.z) + s.off * H * 3) % (H * 3);
      const y0 = H * 1.5 - slide;
      const len = H * s.span;
      if (y0 + len < -40 || y0 > H + 40) continue;

      // Two close rates beating against each other. One sine is a pulse; two
      // is phasing, which is the thing this is a picture of.
      const b = 0.5 + 0.5 * Math.sin(time * s.beat + s.phase)
                    * Math.sin(time * s.beat * 1.13 + s.phase * 1.7);
      const col = s.warm > 0.5 ? WARM : COOL;
      const x = s.x * W;

      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.5, rgba(col, s.a * (0.35 + 0.65 * b)));
      g.addColorStop(1, rgba(col, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + len);
      ctx.stroke();
    }

    // --- bokeh -------------------------------------------------------------
    for (const o of bokeh) {
      const slide = (p * (0.30 / o.z) + o.y * H * 2.2) % (H * 2.2);
      const y = H * 1.1 - slide;
      if (y < -o.r * 2 || y > H + o.r * 2) continue;
      const b = 0.55 + 0.45 * Math.sin(time * o.beat + o.phase);
      const sprite = o.warm > 0.45 ? discWarm : discCool;
      const r = o.r;
      ctx.globalAlpha = o.a * b;
      ctx.drawImage(sprite, o.x * W - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    // --- the shimmer -------------------------------------------------------
    // Gaussian over scroll rather than over viewing angle, and skipped
    // entirely once it is dim, which is most of them at any moment.
    for (const gl of glints) {
      const d = (into - gl.at) / gl.sigma;
      const k = Math.exp(-d * d);
      if (k < 0.03) continue;
      const sprite = gl.warm > 0.35 ? discWarm : discCool;
      const r = gl.r * (1.6 + 2.4 * k);
      ctx.globalAlpha = Math.min(1, gl.a * k);
      ctx.drawImage(sprite, gl.x * W - r, gl.y * H - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  // Only run while the written part is anywhere near the screen.
  let running = false, raf = 0;
  function loop(t) { draw(t); raf = requestAnimationFrame(loop); }
  function start() { if (!running) { running = true; raf = requestAnimationFrame(loop); } }
  function stop() { if (running) { running = false; cancelAnimationFrame(raf); } }

  if (doc && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (es) => (es[0].isIntersecting ? start() : stop()),
      { rootMargin: "200px" }
    ).observe(doc);
  } else {
    start();
  }

  // A still frame is enough for anyone who has asked for less movement.
  if (reduced) { stop(); addEventListener("scroll", () => draw(0), { passive: true }); draw(0); }
}
