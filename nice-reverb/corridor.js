/*  The space behind the written part of the page.
 *
 *  A plinth running down the centre of a machine room lined both sides with
 *  the racks from the splash, and you travel down it as you scroll. The
 *  writing floats in front of it.
 *
 *  This replaces a procedural cavern of vertical columns. That one was drawn
 *  with lines and sprites on a 2D canvas, and the trouble with it was not the
 *  maths - the camera was real and the projection was right - it was that a
 *  rack cannot be faked with primitives. What makes one read is the
 *  machining, and the only way to have machining is to render it. So these
 *  are the real racks, rendered in Cycles, and this file only has to put the
 *  right frame on screen.
 *
 *  Which makes it a scrubber, not a renderer:
 *
 *  * 40 frames of a camera dollying 13 m down the corridor, and scroll
 *    position picks one. No per-frame drawing, no canvas, no GPU context -
 *    the splash already owns one of those and it is the expensive thing on
 *    this page.
 *  * Frames are fetched only when the written part is close, and in scroll
 *    order, so the first screenful is never waiting on them.
 *  * Two stacked images with the top one cross-fading covers the gap between
 *    frames. At 40 frames over a long page a hard cut is visible as a click;
 *    a fade is not.
 *  * If nothing loads, or the visitor asked for reduced motion, the whole
 *    thing stays on frame zero and the page is exactly as readable.
 */
const wrap = document.getElementById("corridor");
if (wrap) {
  const FRAMES = 40;
  const SRC = (i) => `img/corridor/c${String(i).padStart(3, "0")}.webp`;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Two layers: `back` holds the frame we are on, `front` fades the next one
  // over it. Swapping roles rather than reloading keeps it to two decodes.
  const back = new Image();
  const front = new Image();
  for (const el of [back, front]) {
    el.decoding = "async";
    el.alt = "";
    el.className = "corridor-frame";
    wrap.appendChild(el);
  }
  front.style.opacity = "0";

  const cache = new Map();
  let loaded = 0;

  function fetchFrame(i) {
    if (i < 0 || i >= FRAMES || cache.has(i)) return;
    const im = new Image();
    im.decoding = "async";
    im.src = SRC(i);
    cache.set(i, im);
    im.addEventListener("load", () => { loaded++; }, { once: true });
  }

  // Ahead of where you are, because scrolling down is the common case, but a
  // couple behind too so coming back up is not blank.
  function prefetch(around) {
    for (let d = 0; d <= 6; d++) fetchFrame(around + d);
    for (let d = 1; d <= 2; d++) fetchFrame(around - d);
  }

  let shown = -1;
  function show(i) {
    if (i === shown) return;
    const im = cache.get(i);
    if (!im || !im.complete || !im.naturalWidth) return;
    // The frame currently on `back` stays put and the new one fades in over
    // it; then the two swap so the next change fades from where we landed.
    front.src = im.src;
    front.style.opacity = "1";
    shown = i;
    clearTimeout(show._t);
    show._t = setTimeout(() => {
      back.src = im.src;
      front.style.opacity = "0";
    }, 220);
  }

  const doc = document.querySelector(".doc");
  const stage = document.getElementById("stage");

  let ticking = false;
  function update() {
    ticking = false;
    if (!doc) return;
    const H = innerHeight;
    const top = doc.getBoundingClientRect().top;

    // Fade the corridor up as the written part arrives, so it and the splash
    // never fight over the same screen - same handover the cavern used.
    const reveal = Math.min(1, Math.max(0, (H - top) / (H * 0.85)));
    wrap.style.opacity = reveal.toFixed(3);
    if (stage) stage.style.visibility = reveal >= 0.995 ? "hidden" : "visible";
    if (reveal <= 0.001) return;

    // How far through the written part we are drives the dolly.
    const travelled = Math.min(1, Math.max(0,
      (H - top) / (doc.offsetHeight + H * 0.2)));
    const i = reduced ? 0 : Math.min(FRAMES - 1, Math.round(travelled * (FRAMES - 1)));
    prefetch(i);
    show(i);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  // Frame zero up front so there is something behind the text immediately,
  // and it is the one the reduced-motion path never leaves.
  fetchFrame(0);
  const first = cache.get(0);
  first.addEventListener("load", () => {
    back.src = first.src;
    shown = 0;
    update();
  }, { once: true });

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  update();
}
