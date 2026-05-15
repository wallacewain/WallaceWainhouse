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
  pl.setAttribute('stroke-linejoin', 'miter');
  pl.setAttribute('stroke-linecap', 'butt');
  svg.appendChild(pl);
  while (logoA.firstChild) logoA.removeChild(logoA.firstChild);
  logoA.appendChild(svg);

  var CX = 900;       // axis of WMW mirror symmetry
  var DURATION = 30;  // seconds per morph

  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  // Each shape is generated so that:
  //  - The whole WMW is left-right symmetric around CX
  //  - Each W is internally symmetric around its own centre peak (N[2] / N[8])
  //  - The M (2-stroke caret) is symmetric around CX
  // Free parameters: left-W geometry, three y bands, stroke width.
  function makeShape() {
    // --- x geometry of the left W ---
    var n0x  = rnd(-319, 100);           // left outer endpoint x (inward = more compact)
    var n4x  = rnd(350,  750);           // right outer x of W = left outer x of M
    var n2x  = (n0x + n4x) * 0.5;       // W centre peak — derived, ensures W symmetry
    var n1dx = (n4x - n0x) * rnd(0.20, 0.35); // valley half-gap (symmetric around n2x)

    // --- y positions (three independent bands) ---
    var oty  = rnd(-15,  50);   // all outer top nodes:  N[0,4,6,10]
    var ity  = rnd(-15,  50);   // inner W top nodes:    N[2,8]
    var wby  = rnd(150, 252);   // W valley bottoms:     N[1,3,7,9]
    var mby  = rnd(110, 252);   // M centre bottom:      N[5]  (may differ from wby)

    // --- stroke width ---
    var sw = rnd(16, 60);

    return {
      sw: sw,
      n: [
        { x: n0x,                y: oty },  // N[0]  left outer W top
        { x: n2x - n1dx,         y: wby },  // N[1]  left W valley
        { x: n2x,                y: ity },  // N[2]  W centre peak
        { x: n2x + n1dx,         y: wby },  // N[3]  right W valley
        { x: n4x,                y: oty },  // N[4]  right outer W top = left M top
        { x: CX,                 y: mby },  // N[5]  M centre bottom
        { x: 2*CX - n4x,         y: oty },  // N[6]  right M top  (mirror N[4])
        { x: 2*CX - n2x - n1dx,  y: wby },  // N[7]  right-W left valley  (mirror N[3])
        { x: 2*CX - n2x,         y: ity },  // N[8]  right-W centre peak  (mirror N[2])
        { x: 2*CX - n2x + n1dx,  y: wby },  // N[9]  right-W right valley (mirror N[1])
        { x: 2*CX - n0x,         y: oty },  // N[10] right outer W top    (mirror N[0])
      ]
    };
  }

  var from = makeShape(), to = makeShape(), progress = 0;

  function ease(t) { return t * t * (3 - 2 * t); }

  function render() {
    var e = ease(progress), pts = [];
    for (var i = 0; i < 11; i++) {
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
