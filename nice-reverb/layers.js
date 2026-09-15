// Layered depth parallax viewer. No dependencies.
//
// The scene is four Cycles-rendered layers (back, plate, hw, logo), each from a
// few camera angles with a depth grid per angle. Every frame, each layer's
// nearest views are pushed through their own depth meshes into the current
// camera and blended by how close their angle is, then the layers are stacked
// back to front. Near objects really move against far ones, the sides of knobs
// and bulbs come from the angled renders, and the brushed sheen slides because
// neighbouring renders caught it in different places.

const canvas = document.getElementById("c");
const poster = document.getElementById("poster");
const bar = document.querySelector("#bar i");
// ?cam=yaw,pitch&vfov=deg pins the camera for comparisons; ?bloom=0 turns bloom off
const DEBUG = new URLSearchParams(location.search);
const PINNED = DEBUG.has("cam") ? DEBUG.get("cam").split(",").map(Number) : null;
const BASE = new URL(DEBUG.get("layers") || "layers/", new URL(".", location.href));
poster.src = new URL("poster.jpg", BASE).href;

const gl = canvas.getContext("webgl2", {
  antialias: false, alpha: false, depth: false, stencil: false,
  premultipliedAlpha: false, powerPreference: "high-performance",
});
const RAD = Math.PI / 180;
// fitted against the Blender glare reference (?bt= and ?bs= override, for fitting)
const BLOOM_THRESHOLD = DEBUG.has("bt") ? +DEBUG.get("bt") : 0.92;
const BLOOM_STRENGTH = DEBUG.has("bs") ? +DEBUG.get("bs") : 0.5;
const CAPTION_CORE = DEBUG.has("cc") ? +DEBUG.get("cc") : 0.8;
const CAPTION_GLOW = DEBUG.has("cg") ? +DEBUG.get("cg") : 0.32;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ------------------------------------------------------------ GL helpers

function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

function texture(internal, format, type, w, h, data, filter = gl.LINEAR) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (data && data.close) gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, type, data);
  else gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  return t;
}

function target(w, h, depthRB) {
  const tex = texture(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, w, h, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (depthRB) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) throw new Error("half-float render targets unsupported");
  return { tex, fb, w, h };
}

// ------------------------------------------------------------ shaders

const MESH_VS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uDepth;
uniform mat4 uC2W, uViewProj;
uniform vec4 uCrop;        // x0, y0, width, height of the layer crop, px
uniform vec3 uFrame;       // full frame W, H, focal px
uniform float uStep;
uniform vec2 uZ;
in vec2 aPos;              // depth grid cell (i, j)
out vec2 vUV;
void main() {
  vec4 d = texelFetch(uDepth, ivec2(aPos), 0);
  float z = mix(uZ.x, uZ.y, (round(d.r * 255.0) * 256.0 + round(d.g * 255.0)) / 65535.0);
  vec2 off = (aPos + 0.5) * uStep;
  vec2 px = uCrop.xy + off;
  // Blender camera space: looks down -Z, +Y up, image rows run down
  vec3 pc = vec3((px.x - 0.5 * uFrame.x) / uFrame.z * z, -(px.y - 0.5 * uFrame.y) / uFrame.z * z, -z);
  gl_Position = uViewProj * (uC2W * vec4(pc, 1.0));
  vUV = off / uCrop.zw;
}`;

const MESH_FS = `#version 300 es
precision highp float;
uniform sampler2D uColor;
uniform float uWeight;
uniform int uPrepass;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec4 c = texture(uColor, vUV);
  if (c.a < 0.01) discard;  // the depth prepass must skip exactly what the colour pass skips
  outColor = uPrepass == 1 ? vec4(0.0) : vec4(c.rgb * c.a, c.a) * uWeight;
}`;

const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUV;
out vec4 outColor;
void main() { outColor = texture(uTex, vUV); }`;

// bright pass: only what is already near white blooms, like the lamps and nixies
const BRIGHT_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec3 c = vec3(0.0);
  for (int y = -1; y <= 1; y += 2) for (int x = -1; x <= 1; x += 2)
    c += texture(uTex, vUV + vec2(x, y) * uTexel).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = clamp((l - uThreshold) / (1.0 - uThreshold + 1e-3), 0.0, 1.0);
  outColor = vec4(c * k * k, 1.0);
}`;

// dual-filter blur: cheap on phones, smooth enough for a lens glow
const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec3 c = texture(uTex, vUV).rgb * 4.0;
  c += texture(uTex, vUV + vec2(-1, -1) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(1, -1) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(-1, 1) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(1, 1) * uTexel).rgb;
  outColor = vec4(c / 8.0, 1.0);
}`;

const UP_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uTex, vUV + vec2(-2, 0) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(2, 0) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(0, -2) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(0, 2) * uTexel).rgb;
  c += texture(uTex, vUV + vec2(-1, -1) * uTexel).rgb * 2.0;
  c += texture(uTex, vUV + vec2(1, -1) * uTexel).rgb * 2.0;
  c += texture(uTex, vUV + vec2(-1, 1) * uTexel).rgb * 2.0;
  c += texture(uTex, vUV + vec2(1, 1) * uTexel).rgb * 2.0;
  outColor = vec4(c / 12.0, 1.0);
}`;

// the finished picture: scene plus glow, with triangular dither against banding
const PRESENT_FS = `#version 300 es
precision highp float;
uniform sampler2D uScene, uGlow;
uniform float uGlowStrength, uDither;
in vec2 vUV;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(uScene, vUV).rgb + texture(uGlow, vUV).rgb * uGlowStrength;
  float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.31) - 1.0;
  outColor = vec4(c + uDither * n / 255.0, 1.0);
}`;

// The REVERB caption: plain type on a quad in world space, on the wordmark's front
// plane, so it moves with the logo. R holds the letters, G a soft glow.
const CAPTION_VS = `#version 300 es
uniform mat4 uViewProj;
uniform vec3 uOrigin, uRight, uDown;
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = uViewProj * vec4(uOrigin + vUV.x * uRight + vUV.y * uDown, 1.0);
}`;

const CAPTION_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uCore, uGlow;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec4 t = texture(uTex, vUV);
  outColor = vec4(uColor * (t.r * uCore + t.g * uGlow), 1.0);
}`;

// Where REVERB sits in the original logo artwork, in its pixels: the wordmark's
// bounding box, each letter's left and right ink edge, and the cap line/baseline.
const ART = {
  nice: [192, 169, 1617, 689],
  letters: [[950, 974], [1009, 1031], [1064, 1092], [1126, 1147], [1183, 1207], [1242, 1265]],
  capTop: 671, baseline: 696.5, pad: 40, scale: 4,
};

async function captionTexture() {
  let family = "Bahnschrift, Helvetica, Arial, sans-serif";
  try {
    const face = new FontFace("Oxanium", `url(${new URL("fonts/oxanium-500-latin.woff2", location.href)})`, { weight: "500" });
    document.fonts.add(await face.load());
    family = "Oxanium, " + family;
  } catch (e) { console.warn("caption font", e); }
  const k = ART.scale, x0 = ART.letters[0][0] - ART.pad, y0 = ART.capTop - ART.pad;
  const w = Math.ceil((ART.letters[5][1] + ART.pad - x0) * k), h = Math.ceil((ART.baseline + ART.pad - y0) * k);
  const make = () => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return [c, c.getContext("2d", { willReadFrequently: true })];
  };
  const [core, cc] = make(), [glow, gc] = make();
  // size the type so a capital's ink is exactly as tall as in the artwork
  let size = 100;
  cc.font = `500 ${size}px ${family}`;
  size *= ((ART.baseline - ART.capTop) * k) / cc.measureText("E").actualBoundingBoxAscent;
  const draw = (ctx, shift) => {
    ctx.font = `500 ${size}px ${family}`;
    ctx.fillStyle = "#fff";
    "REVERB".split("").forEach((ch, i) => {
      const m = ctx.measureText(ch);
      const centre = ((ART.letters[i][0] + ART.letters[i][1] + 1) / 2 - x0) * k;
      const inkL = -m.actualBoundingBoxLeft, inkR = m.actualBoundingBoxRight;
      ctx.fillText(ch, centre - (inkL + inkR) / 2 + shift, (ART.baseline - y0) * k);
    });
  };
  draw(cc, 0);
  // glow: only the shadow of letters drawn off to the side (canvas filters are not everywhere)
  gc.shadowColor = "#fff";
  gc.shadowBlur = 11 * k;
  gc.shadowOffsetX = 2 * w;
  draw(gc, -2 * w);
  const a = cc.getImageData(0, 0, w, h).data, g = gc.getImageData(0, 0, w, h).data;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = a[i * 4 + 3]; px[i * 4 + 1] = g[i * 4 + 3]; px[i * 4 + 3] = 255; }
  return { px, w, h, x0, y0 };
}

// ------------------------------------------------------------ camera

function lookAt(eye, target, up) {
  const f = norm(sub(target, eye)), s = norm(cross(f, up)), u = cross(s, f);
  return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0,
    -dot(s, eye), -dot(u, eye), dot(f, eye), 1];
}
function perspective(vfov, aspect, near, far) {
  const f = 1 / Math.tan(vfov / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

// How much of the width the wordmark fills: about half on a desktop, most of a phone.
function framing(meta, aspect) {
  const half = Math.atan(meta.logoWidth / 2 / meta.distance);
  const t = clamp((aspect - 0.6) / (1.5 - 0.6), 0, 1);
  const fill = 0.8 + (0.52 - 0.8) * t;
  let hfov = 2 * Math.atan(Math.tan(half) / fill);
  let vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  // a view rendered at yaw 0 must still cover the frame when the camera has turned
  const hmax = (meta.hfov - 2 * meta.viewYaw) * RAD, vmax = (meta.vfov - 2 * meta.viewPitch) * RAD;
  if (vfov > vmax) { vfov = vmax; hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect); }
  if (hfov > hmax) { hfov = hmax; vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect); }
  return { hfov, vfov };
}

// Blend weights over a layer's grid of rendered angles (1, 3 or 3x3 views).
function weights(layer, yaw, pitch) {
  const ys = [...new Set(layer.views.map((v) => v.yaw))].sort((a, b) => a - b);
  const ps = [...new Set(layer.views.map((v) => v.pitch))].sort((a, b) => a - b);
  const axis = (vals, x) => {
    if (vals.length === 1) return [[0, 1]];
    const c = clamp(x, vals[0], vals[vals.length - 1]);
    let i = 0;
    while (i < vals.length - 2 && c > vals[i + 1]) i++;
    const f = (c - vals[i]) / (vals[i + 1] - vals[i]);
    return [[i, 1 - f], [i + 1, f]];
  };
  const out = [];
  for (const [yi, wy] of axis(ys, yaw)) for (const [pi, wp] of axis(ps, pitch)) {
    const w = wy * wp;
    if (w < 1e-4) continue;
    out.push([layer.views.find((v) => v.yaw === ys[yi] && v.pitch === ps[pi]), w]);
  }
  return out;
}

// ------------------------------------------------------------ input

const input = { x: 0, y: 0, last: -1e9 };
let drag = null, orientBase = null;
addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") {
    input.x = (e.clientX / innerWidth) * 2 - 1;
    input.y = (e.clientY / innerHeight) * 2 - 1;
    input.last = performance.now();
  } else if (drag) {
    input.x = clamp(drag.x + (e.clientX - drag.cx) / 160, -1, 1);
    input.y = clamp(drag.y + (e.clientY - drag.cy) / 160, -1, 1);
    input.last = performance.now();
  }
});
addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") drag = { x: input.x, y: input.y, cx: e.clientX, cy: e.clientY };
  const D = window.DeviceOrientationEvent;  // iOS asks permission from a gesture
  if (D && typeof D.requestPermission === "function" && !orientBase) {
    D.requestPermission().then((r) => { if (r === "granted") listenOrientation(); }).catch(() => {});
  }
}, { passive: true });
addEventListener("pointerup", () => { drag = null; });
addEventListener("pointercancel", () => { drag = null; });
function listenOrientation() {
  addEventListener("deviceorientation", (e) => {
    if (e.beta == null || drag) return;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let gx = e.gamma, gy = e.beta;
    if (angle === 90) { gx = e.beta; gy = -e.gamma; }
    else if (angle === -90 || angle === 270) { gx = -e.beta; gy = e.gamma; }
    else if (angle === 180) { gx = -e.gamma; gy = -e.beta; }
    if (!orientBase) orientBase = { x: gx, y: gy };
    orientBase.x += (gx - orientBase.x) * 0.01;  // rest position follows how the phone is held
    orientBase.y += (gy - orientBase.y) * 0.01;
    input.x = clamp((gx - orientBase.x) / 10, -1, 1);
    input.y = clamp((gy - orientBase.y) / 10, -1, 1);
    input.last = performance.now();
  });
}
if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== "function") listenOrientation();

// ------------------------------------------------------------ main

async function main() {
  if (!gl) throw new Error("WebGL2 unavailable");
  if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float"))
    throw new Error("no float render targets");
  const meta = await (await fetch(new URL("layers.json", BASE))).json();
  const total = Object.values(meta.bytes).reduce((a, b) => a + b, 0);
  let got = 0;

  async function bitmap(name) {
    const res = await fetch(new URL(name, BASE));
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const blob = await res.blob();
    got += meta.bytes[name] || blob.size;
    bar.style.width = `${Math.min(100, (100 * got) / total)}%`;
    return createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  }

  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  const jobs = [];
  for (const layer of meta.layers) {
    const [gw, gh] = layer.grid;
    // one index buffer per grid size; the vertex shader reads depth by cell
    const pos = new Float32Array(gw * gh * 2);
    for (let j = 0, k = 0; j < gh; j++) for (let i = 0; i < gw; i++) { pos[k++] = i; pos[k++] = j; }
    const idx = new Uint32Array((gw - 1) * (gh - 1) * 6);
    for (let j = 0, k = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const a = j * gw + i, b = a + 1, c = a + gw, d = c + 1;
      idx.set([a, c, b, b, c, d], k);
      k += 6;
    }
    layer.vao = gl.createVertexArray();
    gl.bindVertexArray(layer.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    layer.count = idx.length;
    for (const v of layer.views) {
      // Blender's matrix rows, as a column-major array for GLSL
      const m = v.c2w;
      v.c2wGL = new Float32Array([m[0][0], m[1][0], m[2][0], 0, m[0][1], m[1][1], m[2][1], 0,
        m[0][2], m[1][2], m[2][2], 0, m[0][3], m[1][3], m[2][3], 1]);
      jobs.push(bitmap(v.color).then((b) => { v.colorTex = texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 0, 0, b); b.close(); }));
      jobs.push(bitmap(v.depth).then((b) => { v.depthTex = texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 0, 0, b, gl.NEAREST); b.close(); }));
    }
  }
  const captionJob = captionTexture();
  await Promise.all(jobs);
  const cap = await captionJob;
  const captionTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, captionTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cap.w, cap.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, cap.px);
  gl.generateMipmap(gl.TEXTURE_2D);  // it is drawn far smaller than it is stored
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // artwork pixels to world metres: the traced wordmark is LOGO_W wide, centred,
  // stood upright facing the camera, its front face at -LOGO_DEPTH/2 in y
  const [nx0, ny0, nx1, ny1] = ART.nice, perPx = meta.logoWidth / (nx1 - nx0);
  const artX = (x) => (x - (nx0 + nx1) / 2) * perPx, artZ = (y) => -(y - (ny0 + ny1) / 2) * perPx;
  const caption = {
    origin: [artX(cap.x0), -meta.logoDepth / 2 - 0.0004, artZ(cap.y0)],
    right: [(cap.w / ART.scale) * perPx, 0, 0],
    down: [0, 0, -(cap.h / ART.scale) * perPx],
  };

  const quadVAO = gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const P = {
    mesh: program(MESH_VS, MESH_FS), copy: program(QUAD_VS, COPY_FS), bright: program(QUAD_VS, BRIGHT_FS),
    caption: program(CAPTION_VS, CAPTION_FS),
    down: program(QUAD_VS, DOWN_FS), up: program(QUAD_VS, UP_FS), present: program(QUAD_VS, PRESENT_FS),
  };

  let T = null;  // render targets, sized with the canvas
  function sizeTargets(w, h) {
    if (T && T.w === w && T.h === h) return;
    if (T) for (const t of [T.scene, T.layer, ...T.glow]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    if (T) gl.deleteRenderbuffer(T.depth);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    const glow = [];
    for (let s = 2, i = 0; i < 5; i++, s *= 2) glow.push(target(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))));
    T = { w, h, depth, scene: target(w, h, depth), layer: target(w, h, depth), glow };
  }

  const meta0 = meta;
  const state = { yaw: 0, pitch: 0 };
  let scale = Math.min(devicePixelRatio || 1, 2), maxScale = scale;
  let slowFrames = 0, fastFrames = 0, prev = performance.now(), shown = false, shownAt = 0;
  function resize() {
    const w = Math.round(innerWidth * scale), h = Math.round(innerHeight * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const { hfov } = framing(meta0, innerWidth / innerHeight);
    poster.style.width = `${innerWidth * Math.tan((meta0.hfov / 2) * RAD) / Math.tan(hfov / 2)}px`;
  }
  addEventListener("resize", resize);
  resize();
  if (poster.complete && poster.naturalWidth) poster.style.opacity = 1;
  else poster.onload = () => { if (!shown) poster.style.opacity = 1; };

  function bindTex(prog, name, tex, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.u[name], unit);
  }
  function quad(prog, fb, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.bindVertexArray(quadVAO);
    gl.useProgram(prog.p);
  }

  function drawLayer(layer, viewProj, yaw, pitch) {
    const p = P.mesh;
    gl.useProgram(p.p);
    gl.bindVertexArray(layer.vao);
    gl.uniformMatrix4fv(p.u.uViewProj, false, viewProj);
    const [x0, y0, x1, y1] = layer.crop;
    gl.uniform4f(p.u.uCrop, x0, y0, x1 - x0, y1 - y0);
    gl.uniform3f(p.u.uFrame, layer.w, layer.h, layer.fl);
    gl.uniform1f(p.u.uStep, layer.step);
    gl.uniform2f(p.u.uZ, layer.z[0], layer.z[1]);
    gl.enable(gl.DEPTH_TEST);
    for (const [v, w] of weights(layer, yaw, pitch)) {
      gl.uniformMatrix4fv(p.u.uC2W, false, v.c2wGL);
      bindTex(p, "uColor", v.colorTex, 0);
      bindTex(p, "uDepth", v.depthTex, 1);
      gl.uniform1f(p.u.uWeight, w);
      // each view hides its own back surfaces, then adds its share of colour
      gl.depthMask(true);  // a depth clear is ignored while the mask is off
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.colorMask(false, false, false, false);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
      gl.uniform1i(p.u.uPrepass, 1);
      gl.drawElements(gl.TRIANGLES, layer.count, gl.UNSIGNED_INT, 0);
      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      gl.depthFunc(gl.EQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1i(p.u.uPrepass, 0);
      gl.drawElements(gl.TRIANGLES, layer.count, gl.UNSIGNED_INT, 0);
    }
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (!PINNED) {
      if (dt > 0.028) { slowFrames++; fastFrames = 0; } else if (dt < 0.014) { fastFrames++; slowFrames = 0; }
      if (slowFrames > 20 && scale > 0.6) { scale = Math.max(0.6, scale * 0.85); slowFrames = 0; resize(); }
      if (fastFrames > 120 && scale < maxScale) { scale = Math.min(maxScale, scale * 1.1); fastFrames = 0; resize(); }
    }
    let tx = input.x, ty = input.y;
    const idle = (now - input.last) / 1000;
    if (idle > 3) {  // a slow drift so the scene never sits frozen
      const k = Math.min(1, (idle - 3) / 2), s = now / 1000;
      tx = tx * (1 - k) + k * 0.55 * Math.sin(s * 0.23);
      ty = ty * (1 - k) + k * 0.45 * Math.sin(s * 0.31 + 1.3);
    }
    const ease = 1 - Math.exp(-dt * 3.5);
    state.yaw += (tx * meta.viewYaw - state.yaw) * ease;
    state.pitch += (-ty * meta.viewPitch - state.pitch) * ease;
    if (PINNED) { state.yaw = PINNED[0]; state.pitch = PINNED[1]; }

    const y = state.yaw * RAD, pt = state.pitch * RAD, d = meta.distance, tg = meta.target;
    const eye = [tg[0] + d * Math.sin(y) * Math.cos(pt), tg[1] - d * Math.cos(y) * Math.cos(pt), tg[2] + d * Math.sin(pt)];
    const aspect = canvas.width / canvas.height;
    const vfov = DEBUG.has("vfov") ? +DEBUG.get("vfov") * RAD : framing(meta, aspect).vfov;
    const viewProj = mul(perspective(vfov, aspect, 0.05, 30), lookAt(eye, tg, [0, 0, 1]));
    sizeTargets(canvas.width, canvas.height);

    // back layer straight into the scene target, the rest composited over it
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fb);
    gl.viewport(0, 0, T.w, T.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const layer of meta.layers) {
      if (layer.opaque) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fb);
        drawLayer(layer, viewProj, state.yaw, state.pitch);
        continue;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.layer.fb);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawLayer(layer, viewProj, state.yaw, state.pitch);
      quad(P.copy, T.scene.fb, T.w, T.h);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      bindTex(P.copy, "uTex", T.layer.tex, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND);
    }

    // the caption, as light: warm letters and a soft halo, easing in after load
    const fade = shownAt ? Math.min(1, (now - shownAt) / 1800) : 0;
    quad(P.caption, T.scene.fb, T.w, T.h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    bindTex(P.caption, "uTex", captionTex, 0);
    gl.uniformMatrix4fv(P.caption.u.uViewProj, false, viewProj);
    gl.uniform3fv(P.caption.u.uOrigin, caption.origin);
    gl.uniform3fv(P.caption.u.uRight, caption.right);
    gl.uniform3fv(P.caption.u.uDown, caption.down);
    gl.uniform3f(P.caption.u.uColor, 1.0, 0.80, 0.58);
    gl.uniform1f(P.caption.u.uCore, CAPTION_CORE * (PINNED ? 1 : fade));
    gl.uniform1f(P.caption.u.uGlow, CAPTION_GLOW * (PINNED ? 1 : fade));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);

    // glow: bright pass at half size, down the chain, back up
    const bloom = DEBUG.get("bloom") !== "0";
    if (bloom) {
      const G = T.glow;
      quad(P.bright, G[0].fb, G[0].w, G[0].h);
      bindTex(P.bright, "uTex", T.scene.tex, 0);
      gl.uniform2f(P.bright.u.uTexel, 0.5 / T.w, 0.5 / T.h);
      gl.uniform1f(P.bright.u.uThreshold, BLOOM_THRESHOLD);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      for (let i = 1; i < G.length; i++) {
        quad(P.down, G[i].fb, G[i].w, G[i].h);
        bindTex(P.down, "uTex", G[i - 1].tex, 0);
        gl.uniform2f(P.down.u.uTexel, 1 / G[i - 1].w, 1 / G[i - 1].h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = G.length - 1; i > 0; i--) {
        quad(P.up, G[i - 1].fb, G[i - 1].w, G[i - 1].h);
        bindTex(P.up, "uTex", G[i].tex, 0);
        gl.uniform2f(P.up.u.uTexel, 0.5 / G[i].w, 0.5 / G[i].h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.BLEND);
    }
    quad(P.present, null, canvas.width, canvas.height);
    bindTex(P.present, "uScene", T.scene.tex, 0);
    bindTex(P.present, "uGlow", T.glow[0].tex, 1);
    gl.uniform1f(P.present.u.uGlowStrength, bloom ? BLOOM_STRENGTH : 0);
    gl.uniform1f(P.present.u.uDither, PINNED ? 0 : 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!shown) {
      shown = true;
      shownAt = now;
      if (PINNED) { poster.style.transition = canvas.style.transition = "none"; poster.style.opacity = 0; }
      canvas.style.opacity = 1;
      document.body.classList.add("ready");
      if (!PINNED) setTimeout(() => { poster.style.opacity = 0; }, 1300);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);  // the poster, a still of the same scene, stays up
  document.body.classList.add("ready", "fallback");
  poster.style.opacity = 1;
});
