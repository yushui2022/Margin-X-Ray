export type IconName =
  | "bolt"
  | "settings"
  | "x"
  | "flask"
  | "plug"
  | "info"
  | "alert"
  | "factory"
  | "search"
  | "check"
  | "lock"
  | "external"
  | "chevron"
  | "shield"
  | "spark"
  | "arrowRight"
  | "clock"
  | "file"
  | "tag"
  | "building";

const PATHS: Record<IconName, string[]> = {
  bolt: ["M13 2 3 14h9l-1 8 10-12h-9l1-8z"],
  settings: [
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  ],
  x: ["M18 6 6 18", "M6 6l12 12"],
  flask: [
    "M9 3h6",
    "M10 3v6L5 17a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9V3",
  ],
  plug: [
    "M12 22v-5",
    "M9 8V2",
    "M15 8V2",
    "M18 8v5a6 6 0 0 1-12 0V8z",
  ],
  info: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    "M12 16v-4",
    "M12 8h.01",
  ],
  alert: [
    "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
    "M12 9v4",
    "M12 17h.01",
  ],
  factory: [
    "M3 21h18",
    "M5 21V9l6 4V9l6 4V9l4 3v9",
    "M9 21v-4",
    "M15 21v-4",
  ],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
  check: ["M20 6 9 17l-5-5"],
  lock: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
  external: ["M15 3h6v6", "M10 14 21 3", "M21 14v7H3V3h7"],
  chevron: ["m9 18 6-6-6-6"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  spark: [
    "M12 3v3",
    "M12 18v3",
    "M3 12h3",
    "M18 12h3",
    "M5.6 5.6l2.1 2.1",
    "M16.3 16.3l2.1 2.1",
    "M18.4 5.6l-2.1 2.1",
    "M7.7 16.3l-2.1 2.1",
  ],
  arrowRight: ["M5 12h14", "m13 6 6 6-6 6"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 6v6l4 2"],
  file: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
  ],
  tag: [
    "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z",
    "M7 7h.01",
  ],
  building: [
    "M3 21h18",
    "M5 21V7l7-4 7 4v14",
    "M9 9h.01",
    "M9 13h.01",
    "M9 17h.01",
    "M15 9h.01",
    "M15 13h.01",
    "M15 17h.01",
  ],
};

export function createIcon(
  name: IconName,
  size = 14,
  className?: string,
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (className) svg.setAttribute("class", className);

  for (const d of PATHS[name]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  return svg;
}
