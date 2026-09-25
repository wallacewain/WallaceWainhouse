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
 *  * 24 frames of a camera rising a third of a metre - a pedestal, not a
 *    dolly and not a zoom - and scroll position picks one. No per-frame drawing, no canvas, no GPU context -
 *    the splash already owns one of those and it is the expensive thing on
 *    this page.
 *  * Frames are fetched only when the written part is close, and in scroll
 *    order, so the first screenful is never waiting on them.
 *  * Two stacked images, and the top one's opacity IS the fraction between
 *    two frames. Scroll drives the dissolve directly, so there is no step to
 *    see and no timer to outrun.
 *  * If nothing loads, or the visitor asked for reduced motion, the whole
 *    thing stays on frame zero and the page is exactly as readable.
 */
const wrap = document.getElementById("corridor");
if (wrap) {
  const FRAMES = 24;
  // ?v= is a cache buster. The frames keep their names when they are
  // re-rendered, so without it a browser that has already seen the page serves
  // what it cached and the new render never shows up. Bump on every re-render.
  const V = 3;
  const SRC = (i) => `img/corridor/c${String(i).padStart(3, "0")}.webp?v=${V}`;
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

  // Continuous blend, not a snap and a timed fade.
  //
  // The first version rounded the scroll position to a frame, swapped the
  // image and ran a 220 ms cross-fade afterwards. Two things were wrong with
  // it: the motion was a staircase, because between two rounding points
  // nothing moved at all; and the fade was on a timer, so scrolling faster
  // than the timer left fades half finished and restarted them, which is what
  // the jumpiness actually was.
  //
  // Now the frame index is fractional. `back` holds the frame below it,
  // `front` holds the frame above, and front's opacity is the fraction
  // between them. Scroll position drives the dissolve directly, so there is
  // no timer to outrun and no step to see - a third of the way between two
  // frames is a third of the way through the dissolve. With the pedestal this
  // slight, consecutive frames are nearly identical and the dissolve reads as
  // continuous movement rather than a blend.
  let lo = -1, hi = -1;
  function showAt(f) {
    const i = Math.floor(f);
    const j = Math.min(FRAMES - 1, i + 1);
    const frac = f - i;

    const a = cache.get(i);
    const b = cache.get(j);
    const ready = (im) => im && im.complete && im.naturalWidth;

    if (i !== lo && ready(a)) { back.src = a.src; lo = i; }
    if (j !== hi && ready(b)) { front.src = b.src; hi = j; }
    // Only dissolve toward a frame that has actually arrived; otherwise hold
    // on the one we have rather than fading to nothing.
    front.style.opacity = (hi === j && ready(b)) ? frac.toFixed(3) : "0";
  }

  const doc = document.querySelector(".doc");
  const divider = document.querySelector(".divider");
  const stage = document.getElementById("stage");

  let ticking = false;
  function update() {
    ticking = false;
    if (!doc) return;
    const H = innerHeight;
    const top = doc.getBoundingClientRect().top;

    // The strip has to actually cut the splash off, not just decide when to
    // switch it off.
    //
    // #stage is fixed and fills the viewport for as long as it is visible, and
    // it sits above the corridor. So while you scroll the written part, the
    // translucent text is over the SPLASH the whole way - and then the moment
    // the strip cleared the top the splash was hidden and everything behind
    // the text became the corridor at once. That is the flash: the two 3D
    // scenes were never divided, they were swapped.
    //
    // Clipping the splash to the region above the strip is what divides them.
    // The strip scrolls, the splash is cut off exactly at its top edge, and
    // the corridor - fixed and full height underneath - is revealed below it
    // line by line. There is no moment when both are behind the same pixel.
    if (stage) {
      const edge = divider
        ? Math.max(0, Math.min(H, divider.getBoundingClientRect().top))
        : Math.max(0, Math.min(H, top));
      stage.style.clipPath = `inset(0 0 ${(H - edge).toFixed(1)}px 0)`;
      // Once it is fully clipped there is nothing to draw; take it out of the
      // compositor rather than leaving a zero-height layer behind.
      stage.style.visibility = edge <= 0 ? "hidden" : "visible";
    }

    // The move is a pedestal, not a dolly: over the whole scroll the camera
    // rises 0.11 m, about 4 mm a frame. It is meant to be imperceptible -
    // enough that the near racks shift against the far ones and the picture
    // is never quite still, and not so much that anything rushes past.
    const travelled = Math.min(1, Math.max(0,
      (H - top) / (doc.offsetHeight + H * 0.2)));
    const f = reduced ? 0 : travelled * (FRAMES - 1);
    prefetch(Math.floor(f));
    showAt(f);
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
    lo = 0;
    update();
  }, { once: true });

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  update();
}
