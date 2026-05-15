(function () {
  const logoA = document.querySelector('header .logo');
  if (!logoA) return;

  // Replace whatever logo variant is on this page with the animated squiggle
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-323 -28 2446 296');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-label', 'WMW');
  svg.setAttribute('fill', 'currentColor');
  const polys = Array.from({ length: 10 }, function () {
    var p = document.createElementNS(NS, 'polygon');
    svg.appendChild(p);
    return p;
  });
  while (logoA.firstChild) logoA.removeChild(logoA.firstChild);
  logoA.appendChild(svg);

  // 11 zigzag nodes: x positions from original design, y alternates top/bottom
  var YT = 3.2, YB = 236.8;
  var OX = [-289.2, -79.2, 165.6, 410.4, 655.2, 900, 1144.8, 1389.6, 1634.4, 1879.2, 2089.2];
  var OY = OX.map(function (_, i) { return i % 2 === 0 ? YT : YB; });
  var N  = OX.length;

  var HW     = 12;  // half stroke width (SVG units)
  var SHRINK = 34;  // pull polygon ends back from node toward each other
  var SPD    = 4;   // SVG units per second — slow enough to be imperceptible
  var NEAR   = 3;   // re-target when within this distance

  function xRange(i) { return (i === 0 || i === N - 1) ? 20 : 80; }
  var YR = 25;

  // Start at a random position on each page load
  var cx = OX.map(function (x, i) { return x + (Math.random() * 2 - 1) * xRange(i); });
  var cy = OY.map(function (y, i) { return y + (Math.random() * 2 - 1) * YR; });
  var tx = cx.slice(), ty = cy.slice();

  function retarget(i) {
    tx[i] = OX[i] + (Math.random() * 2 - 1) * xRange(i);
    ty[i] = OY[i] + (Math.random() * 2 - 1) * YR;
  }
  for (var i = 0; i < N; i++) retarget(i);

  function setPoints(i) {
    var ax = cx[i], ay = cy[i], bx = cx[i+1], by = cy[i+1];
    var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx*dx + dy*dy);
    if (len < 1) return;
    var ux = dx/len, uy = dy/len, nx = -uy, ny = ux;
    var s = Math.min(SHRINK, len * 0.3);
    var p1x = ax + ux*s, p1y = ay + uy*s;
    var p2x = bx - ux*s, p2y = by - uy*s;
    polys[i].setAttribute('points',
      (p1x+nx*HW).toFixed(1)+','+(p1y+ny*HW).toFixed(1)+' '+
      (p1x-nx*HW).toFixed(1)+','+(p1y-ny*HW).toFixed(1)+' '+
      (p2x-nx*HW).toFixed(1)+','+(p2y-ny*HW).toFixed(1)+' '+
      (p2x+nx*HW).toFixed(1)+','+(p2y+ny*HW).toFixed(1));
  }

  function draw() {
    for (var j = 0; j < N - 1; j++) setPoints(j);
  }

  var prev = 0;
  function frame(ts) {
    var dt = Math.min((ts - prev) * 0.001, 0.05);
    prev = ts;
    for (var k = 0; k < N; k++) {
      var ddx = tx[k] - cx[k], ddy = ty[k] - cy[k];
      var d = Math.sqrt(ddx*ddx + ddy*ddy);
      if (d < NEAR) { retarget(k); continue; }
      var step = SPD * dt;
      cx[k] += ddx / d * step;
      cy[k] += ddy / d * step;
    }
    draw();
    requestAnimationFrame(frame);
  }

  draw();
  requestAnimationFrame(frame);
}());
