const MIN_RADIUS = 0.5;
let W = 0;
let H = 0;
let step = 1;
let cols = 0;
let rows = 0;
let divisions = 30;
let sizeMultiplier = 0.8;
let videoAspect = 4 / 3;
let videoLabel = "";

// Offscreen canvas for pixel sampling
const off = Object.assign(document.createElement("canvas"), {
  width: W,
  height: H,
});
const offCtx = off.getContext("2d", { willReadFrequently: true });

// Debug canvas
const debugCanvas = document.getElementById("debug-canvas");
const debugCtx = debugCanvas.getContext("2d");
const mainCanvas = document.getElementById("c");
const canvasWrap = document.getElementById("canvas-wrap");
const status = document.getElementById("status");
const divisionsInput = document.getElementById("divisions");
const divisionsValue = document.getElementById("divisions-value");
const sizeMultiplierInput = document.getElementById("size-multiplier");
const sizeMultiplierValue = document.getElementById("size-multiplier-value");
const vid = document.getElementById("vid");

// Initialize Paper.js on the output canvas.
paper.setup(mainCanvas);

// Shared circle model/path storage.
const circles = [];

// Setup: bind controls, size scene, and request webcam.
syncControls();

divisionsInput.addEventListener("input", () => {
  divisions = Number(divisionsInput.value);
  syncControls();
  rebuildCircles();
});

sizeMultiplierInput.addEventListener("input", () => {
  sizeMultiplier = Number(sizeMultiplierInput.value);
  syncControls();
});

resizeScene();
window.addEventListener("resize", resizeScene);

navigator.mediaDevices
  .getUserMedia({ video: { facingMode: "user" }, audio: false })
  .then((stream) => {
    vid.srcObject = stream;

    const syncVideoAspect = () => {
      if (!vid.videoWidth || !vid.videoHeight) return;

      videoAspect = vid.videoWidth / vid.videoHeight;
      videoLabel = `${vid.videoWidth}x${vid.videoHeight}`;
      resizeScene();
      refreshStatus();
    };

    vid.onloadedmetadata = () => {
      requestAnimationFrame(syncVideoAspect);
      requestAnimationFrame(syncVideoAspect);
    };

    vid.oncanplay = () => {
      syncVideoAspect();
    };
  })
  .catch((err) => {
    videoLabel = "no camera";
    refreshStatus();
    console.error(err);
  });

// Animate
let debugOn = false;
let frameCount = 0;

// Main frame loop: sample webcam pixels and map brightness to circle radii.
paper.view.onFrame = () => {
  if (vid.readyState < 2 || vid.videoWidth === 0) return;

  offCtx.drawImage(vid, 0, 0, W, H);
  if (debugOn) {
    debugCtx.drawImage(off, 0, 0, debugCanvas.width, debugCanvas.height);
  }

  const data = offCtx.getImageData(0, 0, W, H).data;
  frameCount += 1;

  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = Math.min(W - 1, Math.floor(col * step + step / 2));
      const sy = Math.min(H - 1, Math.floor(row * step + step / 2));
      const px = (sx + sy * W) * 4;
      const grey = (data[px] + data[px + 1] + data[px + 2]) / 3;

      if (debugOn && frameCount % 30 === 0 && row === 0 && col === 0) {
        console.log({
          grey,
          rgb: [data[px], data[px + 1], data[px + 2]],
          radius: circles[i].radius,
        });
      }

      const nextRadius = ((255 - grey) / 255) * (step * sizeMultiplier);
      setCircleRadius(circles[i], nextRadius);
      i++;
    }
  }
};

// Build a circle model and backing Paper.js path.
function makeCircle(center, radius) {
  const path = new paper.Path.Circle(center, radius);
  path.fillColor = new paper.Color(0, 0, 1);

  return {
    center,
    radius,
    path,
  };
}

// Scale a circle path to the next radius, clamped to a safe minimum.
function setCircleRadius(circle, nextRadius) {
  const safeRadius = Math.max(MIN_RADIUS, nextRadius);
  circle.path.scale(safeRadius / circle.radius, circle.center);
  circle.radius = safeRadius;
}

// Rebuild a circle path from stored center/radius for clean export geometry.
function rebuildCirclePath(circle) {
  const nextPath = new paper.Path.Circle(circle.center, circle.radius);
  nextPath.fillColor = circle.path.fillColor;
  circle.path.replaceWith(nextPath);
  circle.path = nextPath;
}

// Keep the offscreen sampler canvas in sync with scene dimensions.
function resetOffscreenCanvas() {
  off.width = W;
  off.height = H;
}

// Regenerate the circle grid from current dimensions and division settings.
function rebuildCircles() {
  circles.forEach((circle) => circle.path.remove());
  circles.length = 0;

  cols = Math.max(1, divisions);
  step = W / cols;
  rows = Math.max(1, Math.floor(H / step));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const center = new paper.Point(
        col * step + step / 2,
        row * step + step / 2,
      );
      circles.push(makeCircle(center, Math.max(1, step * 0.1)));
    }
  }

  updateStatus();
}

// Fit the scene to the available area while preserving webcam aspect ratio.
function resizeScene() {
  const boundsWidth = canvasWrap.clientWidth;
  const boundsHeight = canvasWrap.clientHeight;

  let fitW = boundsWidth;
  let fitH = fitW / videoAspect;

  if (fitH > boundsHeight) {
    fitH = boundsHeight;
    fitW = fitH * videoAspect;
  }

  W = Math.max(1, Math.floor(fitW));
  H = Math.max(1, Math.floor(fitH));

  mainCanvas.width = W;
  mainCanvas.height = H;
  paper.view.viewSize = new paper.Size(W, H);
  mainCanvas.style.width = `${W}px`;
  mainCanvas.style.height = `${H}px`;

  resetOffscreenCanvas();
  rebuildCircles();
}

// Render status text for video + grid state.
function updateStatus(videoText = "") {
  const gridText = `${cols}x${rows} step:${step.toFixed(1)}`;
  status.textContent = videoText ? `${videoText} | ${gridText}` : gridText;
}

// Update status using the currently known video label.
function refreshStatus() {
  updateStatus(videoLabel);
}

// Reflect slider state values in the sidebar labels.
function syncControls() {
  divisionsValue.textContent = String(divisions);
  sizeMultiplierValue.textContent = sizeMultiplier.toFixed(2);
}

// Toggle visibility of the debug preview panel.
function toggleDebug() {
  debugOn = !debugOn;
  document.getElementById("debug-wrap").classList.toggle("visible", debugOn);
  document.getElementById("btn-debug").textContent = debugOn
    ? "hide camera"
    : "show camera";
}

// Export normalized SVG (paths rebuilt from stored geometry).
function exportSVG() {
  downloadSVG("frame.svg", true);
}

// Export current SVG scene as-is without path rebuild.
function exportSVGRaw() {
  downloadSVG("frame-raw.svg", false);
}

// Shared SVG download helper.
function downloadSVG(filename, rebuildPaths) {
  if (rebuildPaths) {
    circles.forEach(rebuildCirclePath);
  }

  const svg = paper.project.exportSVG({ asString: true });
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
}
