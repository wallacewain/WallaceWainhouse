(function () {
  var logoA = document.querySelector('header .logo');
  if (!logoA) return;

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-30 -28 900 296');
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

  var CX = 420;       // axis of WMW mirror symmetry
  var DURATION = 30;  // seconds per morph

  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  // X: outer-arm gap sa (1-2, 4-5, 7-8, 10-11) and inner gap sb (all others).
  // N[6] sits at CX: n0x + 2*sa + 3*sb = CX  →  sb = (CX - n0x - 2*sa) / 3.
  // Y: 1=5=7=11=oty  2=4=8=10=lowy  3=9=lowy-d (rise from valley)  6=oty+d (dip from top).
  function makeShape() {
    var n0x  = rnd(-20, 30);
    var r    = rnd(0.3, 2.5);               // sa/sb ratio — varies arm vs. body width
    var sb   = (CX - n0x) / (3 + 2 * r);
    var sa   = r * sb;
    var sw   = rnd(16, 60);

    var span = rnd(100, 260);
    var oty  = rnd(-15, Math.min(40, 250 - span));
    var lowy = oty + span;
    var d    = rnd((lowy - oty) * 0.3, (lowy - oty) * 0.95); // inner W-peak rise / M-center dip

    var xs = [
      n0x,
      n0x + sa,
      n0x + sa + sb,
      n0x + sa + 2 * sb,
      n0x + 2 * sa + 2 * sb,
      CX,
      n0x + 2 * sa + 4 * sb,
      n0x + 3 * sa + 4 * sb,
      n0x + 3 * sa + 5 * sb,
      n0x + 3 * sa + 6 * sb,
      n0x + 4 * sa + 6 * sb
    ];
    var ys = [oty, lowy, lowy - d, lowy, oty, oty + d, oty, lowy, lowy - d, lowy, oty];

    return {
      sw: sw,
      n: xs.map(function(x, i) { return { x: x, y: ys[i] }; })
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
