let lib = null;
const NS = "http://www.w3.org/2000/svg";

async function load() {
  if (!lib) {
    const url = new URL("../vendor/qrcode-generator/qrcode.js", import.meta.url);
    lib = (await import(url.href)).default;
    lib.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
  }
  return lib;
}

export async function qrSvg(text) {
  const qrcode = await load();
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const size = n + 8;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Код с данными листа");
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("width", size);
  bg.setAttribute("height", size);
  bg.setAttribute("fill", "white");
  const path = document.createElementNS(NS, "path");
  let d = "";
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  }
  path.setAttribute("d", d);
  path.setAttribute("fill", "black");
  svg.append(bg, path);
  return svg;
}
