import { ROAD_CONFIG, generateBlockCenters } from "./RoadGenerator.js";

const PALETTE = [
  "#1a1e28", "#222836", "#2a303c", "#1e2430",
  "#252b38", "#181c24", "#2c3340", "#1c222c",
];

const NEON = [
  "#ff2d6a", "#00e5ff", "#b14eff", "#39ff14",
  "#ff9f1c", "#ff4d6d", "#00f5d4", "#fee440",
];

function hash(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function generateBuildings(cfg = ROAD_CONFIG) {
  const centers = generateBlockCenters(cfg);
  const buildings = [];
  const roadHalf = cfg.roadWidth * 0.55;

  centers.forEach((c, i) => {
    const r = hash(c.x, c.z);
    const r2 = hash(c.z, c.x);

    const maxFoot = cfg.blockSize - cfg.sideRoadWidth - 4;
    const w = 6 + r * (maxFoot * 0.45);
    const d = 6 + r2 * (maxFoot * 0.45);

    const dist = Math.sqrt(c.x * c.x + c.z * c.z);
    const centerBoost = Math.max(0, 1 - dist / cfg.citySize);
    const h = 8 + r * 18 + centerBoost * 28 + (r2 > 0.85 ? 20 : 0);

    if (Math.abs(c.x) < roadHalf + w / 2) return;

    const color = PALETTE[Math.floor(r * PALETTE.length)];
    const neon = NEON[Math.floor(r2 * NEON.length)];
    const hasSign = r > 0.35;
    const neonY = 3 + r2 * (h * 0.5);
    const ox = (r - 0.5) * 3;
    const oz = (r2 - 0.5) * 3;

    buildings.push({
      id: i,
      x: c.x + ox,
      z: c.z + oz,
      w, d, h, color, neon, neonY, hasSign,
      windows: r > 0.2,
    });

    if (r > 0.7 && maxFoot > 16) {
      buildings.push({
        id: i + 10000,
        x: c.x - ox * 1.2,
        z: c.z - oz * 1.2,
        w: w * 0.6,
        d: d * 0.55,
        h: h * (0.4 + r2 * 0.4),
        color: PALETTE[Math.floor(r2 * PALETTE.length)],
        neon: NEON[Math.floor(r * NEON.length)],
        neonY: 4,
        hasSign: r2 > 0.5,
        windows: true,
      });
    }
  });

  for (let z = cfg.straightStartZ + 15; z < cfg.straightEndZ - 10; z += 22) {
    const side = z % 44 < 22 ? 1 : -1;
    const r = hash(z, side);
    buildings.push({
      id: 50000 + z,
      x: side * (cfg.straightWidth * 0.5 + 10 + r * 8),
      z,
      w: 8 + r * 10,
      d: 10 + r * 8,
      h: 12 + r * 35,
      color: PALETTE[Math.floor(r * PALETTE.length)],
      neon: NEON[Math.floor((1 - r) * NEON.length)],
      neonY: 5 + r * 10,
      hasSign: true,
      windows: true,
    });
  }

  return buildings;
}

export function buildingsToColliders(buildings, padding = 0.4) {
  return buildings.map((b) => ({
    minX: b.x - b.w / 2 - padding,
    maxX: b.x + b.w / 2 + padding,
    minZ: b.z - b.d / 2 - padding,
    maxZ: b.z + b.d / 2 + padding,
  }));
}
