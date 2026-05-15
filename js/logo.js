(function () {
  var logoA = document.querySelector('header .logo');
  if (!logoA) return;

  // Replace whatever logo variant is on this page with the animated squiggle
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-323 -28 2446 296');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-label', 'WMW');
  var pl = document.createElementNS(NS, 'polyline');
  pl.setAttribute('fill', 'none');
  pl.setAttribute('stroke', 'currentColor');
  pl.setAttribute('stroke-width', '24');
  pl.setAttribute('stroke-linejoin', 'miter');
  pl.setAttribute('stroke-linecap', 'butt');
  svg.appendChild(pl);
  while (logoA.firstChild) logoA.removeChild(logoA.firstChild);
  logoA.appendChild(svg);

  // 11 zigzag nodes, symmetric around x = 900
  // Original positions: tops at YT, bottoms at YB
  var YT = 3.2, YB = 236.8;
  var OX = [-289.2, -79.2, 165.6, 410.4, 655.2, 900, 1144.8, 1389.6, 1634.4, 1879.2, 2089.2];
  var OY = [YT, YB, YT, YB, YT, YB, YT, YB, YT, YB, YT];
  var N = 11;

  // x drift range per node (endpoints tighter so they don't clip viewBox)
  var XR = [20, 80, 80, 80, 80, 0, 80, 80, 80, 80, 20];
  var YR = 25;
  var DURATION = 30; // seconds for one complete morph

  // Generate a symmetric shape: nodes 0-5 are random, 6-10 mirror 4-0 around x=900
  function makeShape() {
    var s = [];
    for (var i = 0; i <= 5; i++) {
      s.push({
        x: OX[i] + (Math.random() * 2 - 1) * XR[i],
        y: OY[i] + (Math.random() * 2 - 1) * YR
      });
    }
    for (var j = 4; j >= 0; j--) {
      s.push({ x: 1800 - s[j].x, y: s[j].y });
    }
    return s;
  }

  var from = makeShape(), to = makeShape(), progress = 0;

  function ease(t) { return t * t * (3 - 2 * t); }

  function render() {
    var e = ease(progress);
    var pts = [];
    for (var i = 0; i < N; i++) {
      pts.push(
        (from[i].x + (to[i].x - from[i].x) * e).toFixed(1) + ',' +
        (from[i].y + (to[i].y - from[i].y) * e).toFixed(1)
      );
    }
    pl.setAttribute('points', pts.join(' '));
  }

  var prev = 0;
  function frame(ts) {
    var dt = Math.min((ts - prev) * 0.001, 0.05);
    prev = ts;
    progress += dt / DURATION;
    if (progress >= 1) {
      from = to;
      to = makeShape();
      progress -= 1;
    }
    render();
    requestAnimationFrame(frame);
  }

  render();
  requestAnimationFrame(frame);
}());
