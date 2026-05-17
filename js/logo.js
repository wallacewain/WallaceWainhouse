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

  // Equal horizontal spacing: every gap between consecutive nodes = sp = (CX - n0x) / 5.
  // Node i is at x = n0x + i * sp.  All 10 intervals are identical, so W and M
  // have exactly the same proportions and M is a true horizontal mirror of W.
  //
  // y-sequence:  oty wby ity wby oty | mby | oty wby ity wby oty
  // M centre mby = oty + wby - ity  (W reflected around the (oty+wby)/2 axis).
  // ity is forced above oty so both the W peak and M notch are always clearly visible.
  function makeShape() {
    var n0x = rnd(-319, 100);
    var sp  = (CX - n0x) / 5;  // equal spacing — the single x degree of freedom

    var oty = rnd(20,  50);
    var ity = Math.max(oty - rnd(25, 55), -25);  // peak clearly above outer tops
    var wby = rnd(150, 225);
    var mby = Math.min(oty + wby - ity, 258);    // W-reflected centre
    var sw  = rnd(16, 60);

    var ys = [oty, wby, ity, wby, oty, mby, oty, wby, ity, wby, oty];
    return {
      sw: sw,
      n: ys.map(function(y, i) { return { x: n0x + i * sp, y: y }; })
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
