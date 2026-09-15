import React, { useMemo, useEffect } from "react";

import {
  ROAD_CONFIG,
  generateRoadSegments,
  generateCrosswalks,
  getMapBounds,
} from "./generators/RoadGenerator.js";
import {
  generateBuildings,
  buildingsToColliders,
} from "./generators/BuildingGenerator.js";
import { generateStreetLights } from "./generators/NeonGenerator.js";
import { stripePositionsAlongSegment } from "./pieces/RoadDetails.js";
import {
  SpiralBuilding,
  getSpiralColliders,
  SPIRAL_CONFIG,
} from "./pieces/SpiralBuilding.jsx";
import { TokyoLighting } from "./TokyoLighting.jsx";

function AsphaltSegment({ seg }) {
  return (
    <mesh position={[seg.x, ROAD_CONFIG.asphaltY, seg.z]} rotation={[0, seg.rotationY, 0]} receiveShadow>
      <boxGeometry args={[seg.width, 0.08, seg.length]} />
      <meshStandardMaterial
        color={seg.type === "race" ? "#1a1c20" : "#22252b"}
        roughness={0.92}
        metalness={0.05}
      />
    </mesh>
  );
}

function CenterStripes({ seg }) {
  if (seg.type === "return" && seg.width < 10) return null;
  const stripes = stripePositionsAlongSegment(seg, seg.type === "race" ? 9 : 7, 3.2);
  return stripes.map((s, i) => (
    <mesh key={i} position={[s.x, ROAD_CONFIG.stripeY, s.z]} rotation={[0, s.rotationY, 0]}>
      <boxGeometry args={[0.22, 0.02, s.len]} />
      <meshStandardMaterial color="#e8d45a" emissive="#e8d45a" emissiveIntensity={0.15} roughness={0.6} />
    </mesh>
  ));
}

function BuildingMesh({ b }) {
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
        <meshStandardMaterial color={b.color} roughness={0.88} metalness={0.08} />
      </mesh>
      {b.windows && (
        <mesh position={[0, b.h * 0.5, b.d / 2 + 0.02]}>
          <planeGeometry args={[b.w * 0.85, b.h * 0.85]} />
          <meshStandardMaterial
            color="#0a0c12"
            emissive={b.neon}
            emissiveIntensity={0.12}
            roughness={0.5}
            transparent
            opacity={0.9}
          />
        </mesh>
      )}
      {b.hasSign && (
        <mesh position={[0, b.neonY, b.d / 2 + 0.2]}>
          <boxGeometry args={[Math.min(b.w * 0.65, 5.5), 0.7, 0.15]} />
          <meshStandardMaterial color={b.neon} emissive={b.neon} emissiveIntensity={1.1} roughness={0.3} />
        </mesh>
      )}
      {b.h > 25 && (
        <mesh position={[b.w * 0.2, b.h + 2, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 4, 5]} />
          <meshStandardMaterial color="#777" metalness={0.6} />
        </mesh>
      )}
    </group>
  );
}

function StreetLight({ light }) {
  return (
    <group position={[light.x, 0, light.z]}>
      <mesh position={[0, light.h / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.18, light.h, 6]} />
        <meshStandardMaterial color="#2a2a30" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, light.h, 0]}>
        <boxGeometry args={[0.8, 0.15, 0.35]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <pointLight position={[0, light.h - 0.3, 0.2]} intensity={0.55} distance={22} color="#ffd9a0" />
    </group>
  );
}

function Crosswalk({ x, z }) {
  const bars = [];
  for (let i = -3; i <= 3; i++) {
    bars.push(
      <mesh key={i} position={[x + i * 0.55, 0.045, z]}>
        <boxGeometry args={[0.35, 0.02, 3.2]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
      </mesh>
    );
  }
  return <group>{bars}</group>;
}

function GroundPlane({ bounds }) {
  const w = bounds.maxX - bounds.minX + 40;
  const d = bounds.maxZ - bounds.minZ + 40;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return (
    <mesh position={[cx, -0.05, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#0d0f14" roughness={1} />
    </mesh>
  );
}

function StartFinishMarkers() {
  const z0 = ROAD_CONFIG.straightStartZ + 8;
  const z1 = ROAD_CONFIG.straightEndZ - 8;
  return (
    <>
      <mesh position={[0, 0.06, z0]}>
        <boxGeometry args={[ROAD_CONFIG.straightWidth * 0.9, 0.03, 1.2]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0.06, z1]}>
        <boxGeometry args={[ROAD_CONFIG.straightWidth * 0.9, 0.03, 1.2]} />
        <meshStandardMaterial color="#ff2d6a" emissive="#ff2d6a" emissiveIntensity={0.4} />
      </mesh>
    </>
  );
}

export default function City({ cityRef, obstacles, mapBounds }) {
  const roads = useMemo(() => generateRoadSegments(), []);
  const buildings = useMemo(() => generateBuildings(), []);
  const lights = useMemo(() => generateStreetLights(roads, 32), [roads]);
  const crosswalks = useMemo(() => generateCrosswalks(), []);
  const bounds = useMemo(() => getMapBounds(), []);

  useEffect(() => {
    if (mapBounds) mapBounds.current = bounds;
    if (obstacles) {
      obstacles.current = [...buildingsToColliders(buildings), ...getSpiralColliders()];
    }
  }, [buildings, bounds, obstacles, mapBounds]);

  const lightsLimited = lights.filter((_, i) => i % 2 === 0).slice(0, 80);

  return (
    <group ref={cityRef}>
      <TokyoLighting />
      <GroundPlane bounds={bounds} />

      {roads.map((seg, i) => (
        <group key={"road-" + i}>
          <AsphaltSegment seg={seg} />
          <CenterStripes seg={seg} />
        </group>
      ))}

      <StartFinishMarkers />

      {crosswalks.filter((_, i) => i % 3 === 0).slice(0, 40).map((c, i) => (
        <Crosswalk key={"cw-" + i} x={c.x} z={c.z} />
      ))}

      {buildings.map((b) => (
        <BuildingMesh key={"b-" + b.id} b={b} />
      ))}

      {lightsLimited.map((l, i) => (
        <StreetLight key={"sl-" + i} light={l} />
      ))}

      <SpiralBuilding />

      <mesh position={[SPIRAL_CONFIG.cx + SPIRAL_CONFIG.radius, 0.5, SPIRAL_CONFIG.cz]}>
        <boxGeometry args={[2, 1, 2]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

export { ROAD_CONFIG, SPIRAL_CONFIG, getMapBounds };
