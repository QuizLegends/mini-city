import React, { useMemo } from "react";

export const SPIRAL_CONFIG = {
  cx: 55,
  cz: -55,
  radius: 14,
  turns: 4.5,
  rampWidth: 9,
  rampThickness: 0.55,
  storyHeight: 3.6,
  coreSize: 10,
  topDeckSize: 28,
};

export function generateSpiralRampData(cfg = SPIRAL_CONFIG) {
  const segments = [];
  const barriers = [];
  const steps = Math.floor(cfg.turns * 28);

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const ang0 = t0 * cfg.turns * Math.PI * 2;
    const ang1 = t1 * cfg.turns * Math.PI * 2;
    const ang = (ang0 + ang1) / 2;
    const y0 = t0 * cfg.turns * cfg.storyHeight;
    const y1 = t1 * cfg.turns * cfg.storyHeight;
    const y = (y0 + y1) / 2;

    const x = cfg.cx + Math.cos(ang) * cfg.radius;
    const z = cfg.cz + Math.sin(ang) * cfg.radius;
    const rotY = -ang + Math.PI / 2;
    const len = cfg.radius * (ang1 - ang0) * 1.15 + 0.8;

    segments.push({
      x, y, z, rotY, len,
      width: cfg.rampWidth,
      thickness: cfg.rampThickness,
    });

    const innerR = cfg.radius - cfg.rampWidth * 0.5 + 0.3;
    const outerR = cfg.radius + cfg.rampWidth * 0.5 - 0.3;
    [innerR, outerR].forEach((r) => {
      barriers.push({
        x: cfg.cx + Math.cos(ang) * r,
        y: y + 0.7,
        z: cfg.cz + Math.sin(ang) * r,
        rotY,
        len: len * 0.95,
        h: 1.2,
      });
    });
  }

  const topY = cfg.turns * cfg.storyHeight + 0.3;
  return { segments, barriers, topY };
}

export function SpiralBuilding() {
  const cfg = SPIRAL_CONFIG;
  const { segments, barriers, topY } = useMemo(() => generateSpiralRampData(cfg), []);

  return (
    <group>
      <mesh position={[cfg.cx, (topY + 2) / 2, cfg.cz]} castShadow receiveShadow>
        <boxGeometry args={[cfg.coreSize, topY + 2, cfg.coreSize]} />
        <meshStandardMaterial color="#1a1e28" roughness={0.85} metalness={0.15} />
      </mesh>

      {Array.from({ length: Math.floor(cfg.turns) }).map((_, i) => (
        <mesh
          key={"ring-" + i}
          position={[cfg.cx, (i + 1) * cfg.storyHeight, cfg.cz]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[cfg.coreSize * 0.55, cfg.coreSize * 0.7, 24]} />
          <meshStandardMaterial
            color="#00e5ff"
            emissive="#00e5ff"
            emissiveIntensity={0.45}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}

      {segments.map((s, i) => (
        <mesh
          key={"ramp-" + i}
          position={[s.x, s.y, s.z]}
          rotation={[0, s.rotY, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[s.width, s.thickness, s.len]} />
          <meshStandardMaterial color="#2a2e35" roughness={0.7} metalness={0.1} />
        </mesh>
      ))}

      {barriers.map((b, i) => (
        <mesh key={"bar-" + i} position={[b.x, b.y, b.z]} rotation={[0, b.rotY, 0]}>
          <boxGeometry args={[0.25, b.h, b.len]} />
          <meshStandardMaterial
            color="#ff2d6a"
            emissive="#ff2d6a"
            emissiveIntensity={0.25}
            roughness={0.5}
          />
        </mesh>
      ))}

      <mesh position={[cfg.cx + cfg.radius, 0.15, cfg.cz]} receiveShadow>
        <boxGeometry args={[cfg.rampWidth + 2, 0.3, 14]} />
        <meshStandardMaterial color="#333840" roughness={0.8} />
      </mesh>

      <mesh position={[cfg.cx, topY, cfg.cz]} receiveShadow castShadow>
        <boxGeometry args={[cfg.topDeckSize, 0.5, cfg.topDeckSize]} />
        <meshStandardMaterial color="#1e222a" roughness={0.75} />
      </mesh>

      {[
        [0, cfg.topDeckSize / 2],
        [0, -cfg.topDeckSize / 2],
        [cfg.topDeckSize / 2, 0],
        [-cfg.topDeckSize / 2, 0],
      ].map(([ox, oz], i) => (
        <mesh key={"topbar-" + i} position={[cfg.cx + ox, topY + 0.9, cfg.cz + oz]}>
          <boxGeometry
            args={[
              Math.abs(ox) > 1 ? 0.3 : cfg.topDeckSize,
              1.4,
              Math.abs(oz) > 1 ? 0.3 : cfg.topDeckSize,
            ]}
          />
          <meshStandardMaterial color="#444" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}

      <mesh position={[cfg.cx, topY + 0.28, cfg.cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4, 5.5, 32]} />
        <meshStandardMaterial color="#fee440" emissive="#fee440" emissiveIntensity={0.35} />
      </mesh>

      <mesh position={[cfg.cx + 8, topY + 4, cfg.cz + 8]}>
        <cylinderGeometry args={[0.12, 0.2, 8, 6]} />
        <meshStandardMaterial color="#888" metalness={0.7} />
      </mesh>
      <mesh position={[cfg.cx - 7, topY + 3, cfg.cz + 6]}>
        <cylinderGeometry args={[0.1, 0.15, 6, 6]} />
        <meshStandardMaterial color="#666" metalness={0.6} />
      </mesh>

      <mesh position={[cfg.cx + cfg.coreSize / 2 + 0.1, topY / 2, cfg.cz]}>
        <boxGeometry args={[0.2, topY * 0.9, 1.2]} />
        <meshStandardMaterial color="#b14eff" emissive="#b14eff" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

export function getSpiralColliders(cfg = SPIRAL_CONFIG) {
  const hs = cfg.coreSize / 2 + 0.5;
  return [
    {
      minX: cfg.cx - hs,
      maxX: cfg.cx + hs,
      minZ: cfg.cz - hs,
      maxZ: cfg.cz + hs,
    },
  ];
}
