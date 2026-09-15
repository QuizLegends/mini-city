export const ROAD_CONFIG = {
  citySize: 70,
  blockSize: 32,
  roadWidth: 12,
  sideRoadWidth: 8,
  sidewalkWidth: 2.0,
  asphaltY: 0.02,
  stripeY: 0.04,
  straightStartZ: 75,
  straightEndZ: 180,
  straightWidth: 16,
  straightLanes: 4,
};

export function generateBlockCenters(cfg = ROAD_CONFIG) {
  const centers = [];
  const step = cfg.blockSize;
  const half = cfg.citySize;
  for (let x = -half + step / 2; x <= half - step / 2; x += step) {
    for (let z = -half + step / 2; z <= half - step / 2; z += step) {
      if (Math.abs(x) < cfg.roadWidth * 0.6) continue;
      centers.push({ x, z });
    }
  }
  return centers;
}

export function generateRoadSegments(cfg = ROAD_CONFIG) {
  const segs = [];
  const half = cfg.citySize;
  const step = cfg.blockSize;

  segs.push({
    x: 0, z: 0, length: half * 2 + 16, width: cfg.roadWidth,
    rotationY: 0, type: "avenue",
  });
  segs.push({
    x: 0, z: 0, length: half * 2 + 16, width: cfg.roadWidth,
    rotationY: Math.PI / 2, type: "avenue",
  });

  for (let z = -half; z <= half; z += step) {
    if (Math.abs(z) < 1) continue;
    segs.push({
      x: 0, z, length: half * 2, width: cfg.sideRoadWidth,
      rotationY: Math.PI / 2, type: "street",
    });
  }
  for (let x = -half; x <= half; x += step) {
    if (Math.abs(x) < 1) continue;
    segs.push({
      x, z: 0, length: half * 2, width: cfg.sideRoadWidth,
      rotationY: 0, type: "street",
    });
  }

  const straightLen = cfg.straightEndZ - cfg.straightStartZ;
  const midZ = (cfg.straightStartZ + cfg.straightEndZ) / 2;

  segs.push({
    x: 0, z: midZ, length: straightLen, width: cfg.straightWidth,
    rotationY: 0, type: "race",
  });
  segs.push({
    x: 0, z: (half + cfg.straightStartZ) / 2,
    length: cfg.straightStartZ - half + 8,
    width: cfg.straightWidth * 0.85, rotationY: 0, type: "avenue",
  });

  const endZ = cfg.straightEndZ;
  segs.push({
    x: -18, z: endZ + 14, length: 30,
    width: cfg.straightWidth * 0.7, rotationY: Math.PI / 2, type: "return",
  });
  segs.push({
    x: -32, z: midZ, length: straightLen + 16,
    width: cfg.straightWidth * 0.65, rotationY: 0, type: "return",
  });
  segs.push({
    x: -32, z: half + 12, length: 32,
    width: cfg.roadWidth, rotationY: Math.PI / 2, type: "avenue",
  });

  return segs;
}

export function generateCrosswalks(cfg = ROAD_CONFIG) {
  const list = [];
  const step = cfg.blockSize;
  const half = cfg.citySize;
  for (let x = -half; x <= half; x += step) {
    for (let z = -half; z <= half; z += step) {
      if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
      list.push({ x, z });
    }
  }
  return list;
}

export function getMapBounds(cfg = ROAD_CONFIG) {
  return {
    minX: -cfg.citySize - 40,
    maxX: cfg.citySize + 15,
    minZ: -cfg.citySize - 8,
    maxZ: cfg.straightEndZ + 35,
  };
}
