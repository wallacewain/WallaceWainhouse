(function () {
  var logoA = document.querySelector('header .logo');
  if (!logoA) return;

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-323 -28 2446 296');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-label', 'WMW');
  var pl = document.createElementNS(NS, 'polyline');
  pl.setAttribute('fill', 'none');
  pl.setAttribute('stroke', 'currentColor');
  pl.setAttribute('stroke-linejoin', 'round');
  pl.setAttribute('stroke-linecap', 'round');
  svg.appendChild(pl);
  while (logoA.firstChild) logoA.removeChild(logoA.firstChild);
  logoA.appendChild(svg);

  var CX = 900;       // axis of WMW mirror symmetry
  var DURATION = 30;  // seconds per morph

  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  // W y-sequence:  oty → wby → ity → wby → oty  (outer-top, valley, peak, valley, outer-top)
  // M y-sequence:  oty → ity → wby → ity → oty  (exact invert: swap valley/peak in middle)
  // M x-positions scaled proportionally to match W's valley-gap ratio.
  function makeShape() {
    var n0x  = rnd(-319, 100);
    var n4x  = rnd(350,  750);
    var n2x  = (n0x + n4x) * 0.5;
    var n1dx = (n4x - n0x) * rnd(0.20, 0.35);

    var oty  = rnd(-15,  50);
    var ity  = rnd(-15,  50);
    var wby  = rnd(150, 252);

    var sw   = rnd(16, 60);

    // M inner x-offset: same valley-gap ratio as W, scaled to M's half-span
    var m1dx = n1dx * (CX - n4x) / ((n4x - n0x) * 0.5);

    return {
      sw: sw,
      n: [
        { x: n0x,               y: oty },  // N[0]  left outer W top
        { x: n2x - n1dx,        y: wby },  // N[1]  left W valley
        { x: n2x,               y: ity },  // N[2]  W centre peak
        { x: n2x + n1dx,        y: wby },  // N[3]  right W valley
        { x: n4x,               y: oty },  // N[4]  right W top = left M outer
        { x: CX - m1dx,         y: ity },  // N[5]  M left inner  (ity, not wby — inverted)
        { x: CX,                y: wby },  // N[6]  M centre bottom
        { x: CX + m1dx,         y: ity },  // N[7]  M right inner (mirror N[5])
        { x: 2*CX - n4x,        y: oty },  // N[8]  right M outer = left right-W outer
        { x: 2*CX - n2x - n1dx, y: wby },  // N[9]  right-W left valley  (mirror N[3])
        { x: 2*CX - n2x,        y: ity },  // N[10] right-W centre peak  (mirror N[2])
        { x: 2*CX - n2x + n1dx, y: wby },  // N[11] right-W right valley (mirror N[1])
        { x: 2*CX - n0x,        y: oty },  // N[12] right outer right-W top (mirror N[0])
      ]
    };
  }

  var from = makeShape(), to = makeShape(), progress = 0;

  function ease(t) { return t * t * (3 - 2 * t); }

  function render() {
    var e = ease(progress), pts = [];
    for (var i = 0; i < 13; i++) {
      pts.push(
        (from.n[i].x + (to.n[i].x - from.n[i].x) * e).toFixed(1) + ',' +
        (from.n[i].y + (to.n[i].y - from.n[i].y) * e).toFixed(1)
      );
    }
    pl.setAttribute('points', pts.join(' '));
    pl.setAttribute('stroke-width', (from.sw + (to.sw - from.sw) * e).toFixed(1));
  }

  var prev = 0;
  function frame(ts) {
    var dt = Math.min((ts - prev) * 0.001, 0.05);
    prev = ts;
    progress += dt / DURATION;
    if (progress >= 1) { from = to; to = makeShape(); progress -= 1; }
    render();
    requestAnimationFrame(frame);
  }

  render();
  requestAnimationFrame(frame);
}());
