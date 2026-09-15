export function generateNeonSigns(buildings) {
  return buildings
    .filter((b) => b.hasSign)
    .map((b) => ({
      x: b.x,
      y: Math.min(b.neonY, b.h - 1),
      z: b.z + b.d / 2 + 0.15,
      w: Math.min(b.w * 0.7, 6),
      h: 0.6,
      color: b.neon,
    }));
}

/** Só posições — SEM pointLight (isso matava o FPS) */
export function generateStreetLights(roadSegments, spacing = 40) {
  const lights = [];
  roadSegments.forEach((seg) => {
    if (seg.type === "street") return;
    const count = Math.max(1, Math.floor(seg.length / spacing));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      const along = t * seg.length;
      const cos = Math.cos(seg.rotationY);
      const sin = Math.sin(seg.rotationY);
      const side = (i % 2 === 0 ? 1 : -1) * (seg.width * 0.5 + 1.2);
      lights.push({
        x: seg.x + along * sin + side * cos,
        z: seg.z + along * cos - side * sin,
        h: 7,
      });
    }
  });
  return lights;
}
