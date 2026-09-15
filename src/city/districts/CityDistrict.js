export const DISTRICTS = {
  center: {
    name: "Centro",
    bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    buildingHeightMul: 1.35,
    neonDensity: 1.2,
  },
  east: {
    name: "Leste Comercial",
    bounds: { minX: 40, maxX: 120, minZ: -80, maxZ: 80 },
    buildingHeightMul: 1.0,
    neonDensity: 1.0,
  },
  west: {
    name: "Oeste Residencial",
    bounds: { minX: -120, maxX: -40, minZ: -80, maxZ: 80 },
    buildingHeightMul: 0.75,
    neonDensity: 0.6,
  },
  raceCorridor: {
    name: "Corredor de Corrida",
    bounds: { minX: -50, maxX: 50, minZ: 100, maxZ: 290 },
    buildingHeightMul: 1.15,
    neonDensity: 1.4,
  },
};

export function getDistrictAt(x, z) {
  for (const key of Object.keys(DISTRICTS)) {
    const d = DISTRICTS[key];
    const b = d.bounds;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return d;
  }
  return DISTRICTS.east;
}
