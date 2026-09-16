import React, {
  useEffect,
  useRef,
  useState,
  useMemo
} from "react";

import { createRoot } from "react-dom/client";

import {
  Canvas,
  useFrame,
  useThree
} from "@react-three/fiber";

import {
  Sky,
  useGLTF,
  useAnimations,
  Text
} from "@react-three/drei";

import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import "./style.css";

window.__keys = {};
window.__joystick = { x: 0, y: 0 };
window.__camera = { yaw: 0, pitch: 0.32 };
window.__cameraLooked = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* =========================================================
   VEÍCULOS / PERSONAGEM
========================================================= */

const CAR_CATALOG = [
  { id: "350z", name: "Nissan 350Z", file: "/models/350z.glb" },
  { id: "evo-amarelo", name: "Evolution Amarelo", file: "/models/Evolution-amarelo.glb" },
  { id: "evo-vermelho", name: "Evolution Vermelho", file: "/models/Evolution-vermelho.glb" },
  { id: "rx7", name: "Mazda RX-7", file: "/models/RX7.glb" },
  { id: "skyline", name: "Skyline", file: "/models/Skyline.glb" },
  { id: "supra", name: "Supra", file: "/models/Supra.glb" }
];

// Garagem: XZ no mapa — Y é ajustado no chão
const GARAGE_POS = new THREE.Vector3(0, 0, 18);
const GARAGE_RADIUS = 7;

// Dimensões da estrutura física da garagem (mantida pequena)
const GARAGE_WIDTH = 7;
const GARAGE_DEPTH = 6.2;
const GARAGE_WALL_HEIGHT = 2.9;

/* =========================================================
   TORRE DE ESTACIONAMENTO COM RAMPA ESPIRAL
   (inspirada em Velozes e Furiosos: Desafio em Tóquio)
========================================================= */

// Posição do centro da torre no mapa (longe da garagem/spawn)
const TOWER_POS = new THREE.Vector3(0, 0, -70);

const TOWER_LEVELS = 9;
const TOWER_LEVEL_HEIGHT = 4.2;
const TOWER_CORE_RADIUS = 6;
const RAMP_GAP = 1.6;
const RAMP_WIDTH = 8.5;
const RAMP_INNER_RADIUS = TOWER_CORE_RADIUS + RAMP_GAP;
const RAMP_OUTER_RADIUS = RAMP_INNER_RADIUS + RAMP_WIDTH;
const TOWER_OUTER_RADIUS = RAMP_OUTER_RADIUS + 3.2;
const TOWER_HEIGHT = TOWER_LEVELS * TOWER_LEVEL_HEIGHT;
const RAMP_SEGMENTS_PER_TURN = 24;
const RAIL_HEIGHT = 0.85;

function getWorldNormal(hit) {
  if (!hit.face || !hit.object) return new THREE.Vector3(0, 1, 0);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
}

/** Raycast para achar altura do chão (usado só na primeira vez / posições fixas) */
function sampleGroundY(mapObject, x, z, fromY = 80, far = 120) {
  if (!mapObject) return 0;
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  ray.far = far;
  const hits = ray.intersectObject(mapObject, true);
  if (!hits.length) return 0;

  // pega o hit mais alto que seja “chão” (normal pra cima)
  let best = null;
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const n = getWorldNormal(hit);
    if (n.y < 0.35) continue;
    if (!best || hit.point.y > best.point.y) best = hit;
  }
  return best ? best.point.y : hits[0].point.y;
}

function moveWithSlide(pos, delta, mapObject, radius) {
  if (!mapObject) return pos.clone().add(delta);

  const ray = new THREE.Raycaster();
  const result = pos.clone();
  const heights = [0.35, 0.75, 1.15];

  function moveAxis(axis) {
    const amount = delta[axis];
    if (Math.abs(amount) < 1e-6) return;

    const sign = Math.sign(amount);
    const dir = new THREE.Vector3(0, 0, 0);
    dir[axis] = sign;

    let nearest = Infinity;

    for (let i = 0; i < heights.length; i++) {
      const origin = result.clone();
      origin.y = pos.y + heights[i];
      origin[axis] += sign * 0.05;

      ray.set(origin, dir);
      ray.far = radius + Math.abs(amount) + 0.35;

      const hits = ray.intersectObject(mapObject, true);
      for (let h = 0; h < hits.length; h++) {
        const hit = hits[h];
        const n = getWorldNormal(hit);
        if (n.y > 0.55) continue;
        if (hit.distance < nearest) nearest = hit.distance;
      }
    }

    if (nearest < Infinity) {
      const allowed = Math.max(0, nearest - radius);
      result[axis] += sign * Math.min(Math.abs(amount), allowed);
    } else {
      result[axis] += amount;
    }
  }

  moveAxis("x");
  moveAxis("z");
  return result;
}

/**
 * Gruda no chão logo ABAIXO/PERTO da posição atual (janela vertical estreita).
 * Isso é essencial numa estrutura com vários andares empilhados na mesma
 * coluna XZ (como a rampa em espiral): em vez de sempre pegar a superfície
 * mais alta do mapa inteiro, pegamos apenas a superfície mais próxima da
 * altura atual do jogador/carro.
 */
function stickToGround(pos, mapObject, yOffset) {
  if (!mapObject) return pos.y;

  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3(pos.x, pos.y + 2.1, pos.z);
  ray.set(origin, new THREE.Vector3(0, -1, 0));
  ray.far = 4.2;

  const hits = ray.intersectObject(mapObject, true);
  let best = null;

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const n = getWorldNormal(hit);
    if (n.y < 0.35) continue;
    if (!best || hit.point.y > best.point.y) best = hit;
  }

  if (best) return best.point.y + yOffset;
  if (hits.length) return hits[0].point.y + yOffset;
  return pos.y;
}

const CHAR_PATH = "/models/personagem.glb";

function Player({ playerRef, inCar, isMoving }) {
  const { scene, animations } = useGLTF(CHAR_PATH);

  const clone = useMemo(() => {
    const c = skeletonClone(scene);
    c.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  const charScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = size.y || 1;
    let s = 1.65 / h;
    if (s > 5) s = 0.01;
    if (s < 0.001) s = 0.01;
    return s;
  }, [scene]);

  const { actions, names } = useAnimations(animations, playerRef);

  useEffect(() => {
    if (!actions || names.length === 0) return;

    const walkName =
      names.find((n) => /walk|run|running|walking|move/i.test(n)) || names[0];
    const idleName = names.find(
      (n) => /idle|stand|wait|breath/i.test(n) && !/walk|run/i.test(n)
    );

    Object.values(actions).forEach((a) => {
      if (a && a.isRunning && a.isRunning()) a.fadeOut(0.1);
    });

    if (isMoving) {
      const act = actions[walkName];
      if (act) {
        act.reset().fadeIn(0.12).play();
        act.setLoop(THREE.LoopRepeat, Infinity);
      }
    } else if (idleName && actions[idleName]) {
      actions[idleName].reset().fadeIn(0.12).play();
      actions[idleName].setLoop(THREE.LoopRepeat, Infinity);
    } else if (walkName && actions[walkName]) {
      actions[walkName].stop();
      actions[walkName].reset();
    }
  }, [isMoving, actions, names]);

  return (
    <group
      ref={playerRef}
      scale={[charScale, charScale, charScale]}
      position={[0, 5, 0]}
      visible={!inCar}
      dispose={null}
    >
      <primitive object={clone} />
    </group>
  );
}

useGLTF.preload(CHAR_PATH);

/* =========================================================
   GEOMETRIA PROCEDURAL DA RAMPA ESPIRAL
========================================================= */

/** Ponto 3D de um helicoide: ângulo -> posição, com altura crescente. */
function helixPoint(angle, radius, heightPerTurn, startY) {
  const y = startY + (angle / (Math.PI * 2)) * heightPerTurn;
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

/**
 * Constrói a superfície dirigível da rampa em espiral como uma fita
 * (ribbon) entre innerRadius e innerRadius+width, subindo heightPerTurn
 * por volta completa, ao longo de `turns` voltas.
 */
function buildSpiralRampGeometry({
  innerRadius,
  width,
  turns,
  heightPerTurn,
  segmentsPerTurn,
  startY
}) {
  const outerRadius = innerRadius + width;
  const totalAngle = turns * Math.PI * 2;
  const segments = Math.max(1, Math.round(turns * segmentsPerTurn));

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * totalAngle;
    const inner = helixPoint(angle, innerRadius, heightPerTurn, startY);
    const outer = helixPoint(angle, outerRadius, heightPerTurn, startY);

    positions.push(inner.x, inner.y, inner.z);
    positions.push(outer.x, outer.y, outer.z);

    const v = i / segments;
    uvs.push(0, v * turns * 2);
    uvs.push(1, v * turns * 2);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2; // inner atual
    const b = i * 2 + 1; // outer atual
    const c = (i + 1) * 2; // inner próximo
    const d = (i + 1) * 2 + 1; // outer próximo

    // winding escolhido para normais apontando para cima (+Y)
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Constrói uma parede vertical fina que acompanha o mesmo helicoide da
 * rampa — usada como guard-rail interno (junto ao núcleo) e externo
 * (na borda da rampa) para impedir que o carro caia.
 */
function buildHelixWallGeometry({
  radius,
  turns,
  heightPerTurn,
  segmentsPerTurn,
  startY,
  railHeight
}) {
  const totalAngle = turns * Math.PI * 2;
  const segments = Math.max(1, Math.round(turns * segmentsPerTurn));

  const positions = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * totalAngle;
    const base = helixPoint(angle, radius, heightPerTurn, startY);
    positions.push(base.x, base.y, base.z);
    positions.push(base.x, base.y + railHeight, base.z);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;

    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Torre de estacionamento com rampa espiral contínua — estágio 1.
 * Substitui o mapa importado do Sketchfab por uma estrutura 100%
 * procedural (praça plana + núcleo + rampa + guard-rails + colunas +
 * vigas de nível), pronta para futura expansão.
 */
function DriftTower({ mapRef, mapBounds, onMapReady }) {
  const group = useMemo(() => {
    const g = new THREE.Group();

    // ---------- Praça / piso base (ambiente propositalmente simples) ----------
    const plazaGeo = new THREE.BoxGeometry(240, 0.4, 240);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: "#6d6d68",
      roughness: 0.95,
      metalness: 0.02
    });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.set(0, -0.2, 0);
    plaza.receiveShadow = true;
    g.add(plaza);

    // ---------- Núcleo central (poço de circulação) ----------
    const coreGeo = new THREE.CylinderGeometry(
      TOWER_CORE_RADIUS,
      TOWER_CORE_RADIUS + 0.4,
      TOWER_HEIGHT,
      32,
      1,
      true
    );
    const coreMat = new THREE.MeshStandardMaterial({
      color: "#8d8d87",
      roughness: 0.92,
      metalness: 0.06,
      side: THREE.DoubleSide
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(TOWER_POS.x, TOWER_POS.y + TOWER_HEIGHT / 2, TOWER_POS.z);
    core.castShadow = true;
    core.receiveShadow = true;
    g.add(core);

    // Laje de cobertura do núcleo (topo)
    const capGeo = new THREE.CylinderGeometry(
      TOWER_CORE_RADIUS + 0.4,
      TOWER_CORE_RADIUS + 0.4,
      0.3,
      32
    );
    const cap = new THREE.Mesh(capGeo, coreMat);
    cap.position.set(TOWER_POS.x, TOWER_POS.y + TOWER_HEIGHT + 0.15, TOWER_POS.z);
    cap.castShadow = true;
    cap.receiveShadow = true;
    g.add(cap);

    // ---------- Rampa espiral (piso dirigível) ----------
    const rampGeo = buildSpiralRampGeometry({
      innerRadius: RAMP_INNER_RADIUS,
      width: RAMP_WIDTH,
      turns: TOWER_LEVELS,
      heightPerTurn: TOWER_LEVEL_HEIGHT,
      segmentsPerTurn: RAMP_SEGMENTS_PER_TURN,
      startY: 0.05
    });
    const rampMat = new THREE.MeshStandardMaterial({
      color: "#5a5a5d",
      roughness: 0.88,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.position.copy(TOWER_POS);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    g.add(ramp);

    // Parte de baixo da laje da rampa (dá espessura/realismo visto de baixo)
    const rampUnderGeo = buildSpiralRampGeometry({
      innerRadius: RAMP_INNER_RADIUS,
      width: RAMP_WIDTH,
      turns: TOWER_LEVELS,
      heightPerTurn: TOWER_LEVEL_HEIGHT,
      segmentsPerTurn: RAMP_SEGMENTS_PER_TURN,
      startY: -0.28
    });
    const rampUnderMat = new THREE.MeshStandardMaterial({
      color: "#3f3f42",
      roughness: 0.95,
      metalness: 0.04,
      side: THREE.BackSide
    });
    const rampUnder = new THREE.Mesh(rampUnderGeo, rampUnderMat);
    rampUnder.position.copy(TOWER_POS);
    rampUnder.receiveShadow = true;
    g.add(rampUnder);

    // ---------- Guard-rails (interno junto ao núcleo, externo na borda) ----------
    const innerWallGeo = buildHelixWallGeometry({
      radius: RAMP_INNER_RADIUS,
      turns: TOWER_LEVELS,
      heightPerTurn: TOWER_LEVEL_HEIGHT,
      segmentsPerTurn: RAMP_SEGMENTS_PER_TURN,
      startY: 0.05,
      railHeight: RAIL_HEIGHT
    });
    const outerWallGeo = buildHelixWallGeometry({
      radius: RAMP_OUTER_RADIUS,
      turns: TOWER_LEVELS,
      heightPerTurn: TOWER_LEVEL_HEIGHT,
      segmentsPerTurn: RAMP_SEGMENTS_PER_TURN,
      startY: 0.05,
      railHeight: RAIL_HEIGHT
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: "#4a4f52",
      roughness: 0.55,
      metalness: 0.4,
      side: THREE.DoubleSide
    });
    const innerRail = new THREE.Mesh(innerWallGeo, railMat);
    innerRail.position.copy(TOWER_POS);
    innerRail.castShadow = true;
    innerRail.receiveShadow = true;
    g.add(innerRail);

    const outerRail = new THREE.Mesh(outerWallGeo, railMat);
    outerRail.position.copy(TOWER_POS);
    outerRail.castShadow = true;
    outerRail.receiveShadow = true;
    g.add(outerRail);

    // Corrimão (tubo fino) no topo de cada guard-rail — puramente estético
    const railCapMat = new THREE.MeshStandardMaterial({
      color: "#d8d8d2",
      roughness: 0.4,
      metalness: 0.5
    });
    [RAMP_INNER_RADIUS, RAMP_OUTER_RADIUS].forEach((radius) => {
      const segs = TOWER_LEVELS * RAMP_SEGMENTS_PER_TURN;
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const angle = (i / segs) * TOWER_LEVELS * Math.PI * 2;
        const p = helixPoint(angle, radius, TOWER_LEVEL_HEIGHT, 0.05 + RAIL_HEIGHT);
        pts.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, segs, 0.06, 6, false);
      const tube = new THREE.Mesh(tubeGeo, railCapMat);
      tube.position.copy(TOWER_POS);
      tube.castShadow = true;
      g.add(tube);
    });

    // ---------- Colunas de fachada (perímetro, altura total) ----------
    const columnCount = 28;
    const columnGeo = new THREE.CylinderGeometry(0.4, 0.46, TOWER_HEIGHT, 8);
    const columnMat = new THREE.MeshStandardMaterial({
      color: "#3d4145",
      roughness: 0.5,
      metalness: 0.45
    });
    for (let i = 0; i < columnCount; i++) {
      const angle = (i / columnCount) * Math.PI * 2;
      const col = new THREE.Mesh(columnGeo, columnMat);
      col.position.set(
        TOWER_POS.x + Math.cos(angle) * TOWER_OUTER_RADIUS,
        TOWER_POS.y + TOWER_HEIGHT / 2,
        TOWER_POS.z + Math.sin(angle) * TOWER_OUTER_RADIUS
      );
      col.castShadow = true;
      col.receiveShadow = true;
      g.add(col);
    }

    // ---------- Vigas de nível (anéis horizontais a cada andar) ----------
    const beamMat = new THREE.MeshStandardMaterial({
      color: "#5a5e61",
      roughness: 0.6,
      metalness: 0.3
    });
    for (let lvl = 0; lvl <= TOWER_LEVELS; lvl++) {
      const y = lvl * TOWER_LEVEL_HEIGHT;
      const beamGeo = new THREE.TorusGeometry(TOWER_OUTER_RADIUS, 0.22, 8, 48);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.x = Math.PI / 2;
      beam.position.set(TOWER_POS.x, TOWER_POS.y + y, TOWER_POS.z);
      beam.castShadow = true;
      beam.receiveShadow = true;
      g.add(beam);
    }

    // ---------- Base / fundação visível no térreo ----------
    const baseGeo = new THREE.CylinderGeometry(
      TOWER_OUTER_RADIUS + 0.6,
      TOWER_OUTER_RADIUS + 1.2,
      0.6,
      40
    );
    const baseMat = new THREE.MeshStandardMaterial({
      color: "#5f5f5a",
      roughness: 0.95
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(TOWER_POS.x, TOWER_POS.y - 0.3, TOWER_POS.z);
    base.receiveShadow = true;
    g.add(base);

    g.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(g);
    if (mapBounds) {
      mapBounds.current = {
        minX: finalBox.min.x + 2,
        maxX: finalBox.max.x - 2,
        minZ: finalBox.min.z + 2,
        maxZ: finalBox.max.z - 2,
        minY: finalBox.min.y,
        maxY: finalBox.max.y
      };
    }

    if (onMapReady) {
      queueMicrotask(() => onMapReady(g));
    }

    return g;
  }, [mapBounds, onMapReady]);

  return <primitive ref={mapRef} object={group} />;
}

/* =========================================================
   GARAGEM — estrutura pequena e detalhada
========================================================= */

function GarageMarker({ mapRef }) {
  const groupRef = useRef();

  useFrame(() => {
    if (!groupRef.current || !mapRef.current) return;
    const y = sampleGroundY(mapRef.current, GARAGE_POS.x, GARAGE_POS.z);
    groupRef.current.position.set(GARAGE_POS.x, y, GARAGE_POS.z);
  });

  // Ripas da parede traseira (efeito de chapa corrugada)
  const backSlats = useMemo(() => {
    const count = 16;
    const usable = GARAGE_WIDTH - 0.2;
    const w = usable / count;
    return Array.from({ length: count }, (_, i) => ({
      x: -usable / 2 + w * i + w / 2,
      w
    }));
  }, []);

  // Ripas das paredes laterais
  const sideSlats = useMemo(() => {
    const count = 14;
    const usable = GARAGE_DEPTH - 0.2;
    const w = usable / count;
    return Array.from({ length: count }, (_, i) => ({
      z: -usable / 2 + w * i + w / 2,
      w
    }));
  }, []);

  // Réguas do portão de enrolar
  const doorSlats = useMemo(() => {
    const count = 7;
    const doorHeight = 2.45;
    const h = doorHeight / count;
    return Array.from({ length: count }, (_, i) => ({
      y: -doorHeight / 2 + h * i + h / 2,
      h
    }));
  }, []);

  return (
    <group ref={groupRef} position={[GARAGE_POS.x, 0, GARAGE_POS.z]}>
      {/* Base de concreto */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[GARAGE_WIDTH + 1.6, 0.1, GARAGE_DEPTH + 1.6]} />
        <meshStandardMaterial color="#8c8c86" roughness={0.95} />
      </mesh>

      {/* Piso interno */}
      <mesh position={[0, 0.11, 0]} receiveShadow>
        <boxGeometry args={[GARAGE_WIDTH, 0.03, GARAGE_DEPTH]} />
        <meshStandardMaterial color="#48484a" roughness={0.85} />
      </mesh>

      {/* Faixas de piso (linhas de vaga) */}
      {[-1.5, 1.5].map((x) => (
        <mesh key={"stripe-" + x} position={[x, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, GARAGE_DEPTH - 0.6]} />
          <meshStandardMaterial color="#f2d94e" roughness={0.7} />
        </mesh>
      ))}

      {/* Anel neon de sinalização no chão */}
      <mesh position={[0, 0.14, GARAGE_DEPTH / 2 + 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.7, 2.05, 32]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={1.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pilares metálicos de canto */}
      {[
        [-GARAGE_WIDTH / 2 + 0.14, -GARAGE_DEPTH / 2 + 0.14],
        [GARAGE_WIDTH / 2 - 0.14, -GARAGE_DEPTH / 2 + 0.14],
        [-GARAGE_WIDTH / 2 + 0.14, GARAGE_DEPTH / 2 - 0.14],
        [GARAGE_WIDTH / 2 - 0.14, GARAGE_DEPTH / 2 - 0.14]
      ].map(([x, z], i) => (
        <mesh
          key={"pillar-" + i}
          position={[x, GARAGE_WALL_HEIGHT / 2 + 0.1, z]}
          castShadow
        >
          <cylinderGeometry args={[0.13, 0.16, GARAGE_WALL_HEIGHT + 0.2, 8]} />
          <meshStandardMaterial color="#2b2f33" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}

      {/* Parede traseira corrugada */}
      <group position={[0, GARAGE_WALL_HEIGHT / 2 + 0.1, -GARAGE_DEPTH / 2 + 0.05]}>
        {backSlats.map((s, i) => (
          <mesh
            key={"back-slat-" + i}
            position={[s.x, 0, i % 2 === 0 ? 0.025 : 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[s.w - 0.02, GARAGE_WALL_HEIGHT, 0.08]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#5b6b74" : "#4f5d65"}
              metalness={0.35}
              roughness={0.55}
            />
          </mesh>
        ))}
      </group>

      {/* Paredes laterais corrugadas */}
      {[-1, 1].map((side) => (
        <group
          key={"side-" + side}
          position={[side * (GARAGE_WIDTH / 2 - 0.05), GARAGE_WALL_HEIGHT / 2 + 0.1, 0]}
        >
          {sideSlats.map((s, i) => (
            <mesh
              key={"side-slat-" + side + "-" + i}
              position={[i % 2 === 0 ? side * 0.025 : 0, 0, s.z]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.08, GARAGE_WALL_HEIGHT, s.w - 0.02]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? "#5b6b74" : "#4f5d65"}
                metalness={0.35}
                roughness={0.55}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* Verga estrutural acima da porta */}
      <mesh
        position={[0, GARAGE_WALL_HEIGHT + 0.24, GARAGE_DEPTH / 2 - 0.02]}
        castShadow
      >
        <boxGeometry args={[GARAGE_WIDTH - 0.3, 0.3, 0.16]} />
        <meshStandardMaterial color="#2b2f33" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Portão de enrolar com réguas */}
      <group position={[0, 1.34, GARAGE_DEPTH / 2 - 0.02]}>
        {doorSlats.map((s, i) => (
          <mesh key={"door-slat-" + i} position={[0, s.y, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.35, s.h - 0.03, 0.1]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#d8d8d2" : "#c4c4be"}
              metalness={0.25}
              roughness={0.4}
            />
          </mesh>
        ))}
        {/* Moldura da porta */}
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[3.5, 2.6, 0.04]} />
          <meshStandardMaterial color="#1c1f22" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Puxador central */}
        <mesh position={[0, -1.1, 0.08]}>
          <boxGeometry args={[0.6, 0.08, 0.06]} />
          <meshStandardMaterial color="#101214" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      {/* Batentes laterais da porta */}
      {[-1.78, 1.78].map((x) => (
        <mesh
          key={"jamb-" + x}
          position={[x, GARAGE_WALL_HEIGHT / 2 - 0.05, GARAGE_DEPTH / 2 - 0.02]}
          castShadow
        >
          <boxGeometry args={[0.16, GARAGE_WALL_HEIGHT - 0.1, 0.18]} />
          <meshStandardMaterial color="#2b2f33" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}

      {/* Telhado de duas águas */}
      <group position={[0, GARAGE_WALL_HEIGHT + 0.25, 0]}>
        <mesh
          position={[0, 0.24, -GARAGE_DEPTH / 4]}
          rotation={[0.22, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[GARAGE_WIDTH + 0.6, 0.08, GARAGE_DEPTH / 2 + 0.5]} />
          <meshStandardMaterial color="#7a2f2f" metalness={0.2} roughness={0.6} />
        </mesh>
        <mesh
          position={[0, 0.24, GARAGE_DEPTH / 4]}
          rotation={[-0.22, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[GARAGE_WIDTH + 0.6, 0.08, GARAGE_DEPTH / 2 + 0.5]} />
          <meshStandardMaterial color="#7a2f2f" metalness={0.2} roughness={0.6} />
        </mesh>
        {/* Cumeeira */}
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[GARAGE_WIDTH + 0.5, 0.12, 0.12]} />
          <meshStandardMaterial color="#3a1c1c" roughness={0.6} />
        </mesh>
        {/* Beiral frontal */}
        <mesh position={[0, -0.02, GARAGE_DEPTH / 2 + 0.35]} castShadow>
          <boxGeometry args={[GARAGE_WIDTH + 0.7, 0.1, 0.25]} />
          <meshStandardMaterial color="#5c2424" roughness={0.55} />
        </mesh>
      </group>

      {/* Placa luminosa com o nome */}
      <mesh position={[0, GARAGE_WALL_HEIGHT + 0.62, GARAGE_DEPTH / 2 + 0.06]}>
        <boxGeometry args={[3.1, 0.6, 0.07]} />
        <meshStandardMaterial
          color="#0d2838"
          emissive="#00a0c0"
          emissiveIntensity={0.4}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, GARAGE_WALL_HEIGHT + 0.62, GARAGE_DEPTH / 2 + 0.1]}>
        <boxGeometry args={[2.9, 0.42, 0.02]} />
        <meshStandardMaterial
          color="#04141c"
          emissive="#00c8e8"
          emissiveIntensity={0.25}
        />
      </mesh>
      <Text
        position={[0, GARAGE_WALL_HEIGHT + 0.62, GARAGE_DEPTH / 2 + 0.12]}
        fontSize={0.3}
        color="#00f0ff"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.06}
      >
        GARAGEM
      </Text>

      {/* Luminária sobre a porta */}
      <mesh position={[0, GARAGE_WALL_HEIGHT + 0.02, GARAGE_DEPTH / 2 + 0.16]} castShadow>
        <boxGeometry args={[0.3, 0.12, 0.14]} />
        <meshStandardMaterial color="#1c1f22" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, GARAGE_WALL_HEIGHT - 0.04, GARAGE_DEPTH / 2 + 0.16]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#fff1c9" emissive="#fff1c9" emissiveIntensity={1.5} />
      </mesh>
      <pointLight
        position={[0, GARAGE_WALL_HEIGHT + 0.1, GARAGE_DEPTH / 2 + 0.7]}
        intensity={1.1}
        distance={9}
        color="#fff1c9"
      />

      {/* Luz interna ambiente da garagem */}
      <pointLight position={[0, GARAGE_WALL_HEIGHT - 0.2, 0]} intensity={0.9} distance={9} color="#bfe8ff" />

      {/* Extintor na parede lateral (detalhe) */}
      <mesh position={[GARAGE_WIDTH / 2 - 0.18, 1.1, GARAGE_DEPTH / 2 - 1.2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.32, 8]} />
        <meshStandardMaterial color="#b22222" metalness={0.2} roughness={0.4} />
      </mesh>
    </group>
  );
}

function findWheelMeshes(root) {
  const found = [];
  const skip = /shadow|plane|ground|decal|glass|window|body|chassis|interior|light/i;

  root.traverse((child) => {
    if (!child.isMesh) return;
    const name = (child.name || "").toLowerCase();
    if (skip.test(name)) return;
    if (
      name.includes("wheel") ||
      name.includes("tire") ||
      name.includes("tyre") ||
      name.includes("rim") ||
      name.includes("roda") ||
      name.includes("pneu")
    ) {
      found.push(child);
    }
  });
  return found;
}

function CarModel({ path, wheelsRef }) {
  const { scene } = useGLTF(path);

  const model = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetLength = 5.2;
    const currentLength = Math.max(size.x, size.z, 0.01);
    const scale = targetLength / currentLength;
    c.scale.setScalar(scale);

    const center = new THREE.Vector3();
    box.getCenter(center);
    c.position.sub(center.multiplyScalar(scale));

    const box2 = new THREE.Box3().setFromObject(c);
    c.position.y -= box2.min.y;
    c.position.y += 0.15;

    c.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    if (wheelsRef) wheelsRef.current = findWheelMeshes(c);
    return c;
  }, [scene, path, wheelsRef]);

  return <primitive object={model} />;
}

CAR_CATALOG.forEach((c) => {
  try {
    useGLTF.preload(c.file);
  } catch (e) {}
});

function Car({
  carRef,
  playerRef,
  inCar,
  mapBounds,
  mapRef,
  carPath,
  velocityRef
}) {
  const velocity = useRef(0);
  const steering = useRef(0);
  const wheelsRef = useRef([]);
  const groundedOnce = useRef(false);

  useFrame((_, delta) => {
    if (!carRef.current) return;

    // Garante spawn em cima do mapa (primeira vez)
    if (mapRef.current && !groundedOnce.current) {
      const gy = sampleGroundY(mapRef.current, carRef.current.position.x, carRef.current.position.z);
      carRef.current.position.y = gy + 0.15;
      groundedOnce.current = true;
    }

    if (inCar) {
      const keys = window.__keys || {};
      const joy = window.__joystick || { x: 0, y: 0 };

      const throttle = keys.w ? 1 : keys.s ? -1 : -joy.y;
      const turn = keys.a ? 1 : keys.d ? -1 : -joy.x;

      velocity.current += throttle * 18 * delta;
      velocity.current *= Math.pow(0.28, delta);
      velocity.current = clamp(velocity.current, -9, 26);

      steering.current = THREE.MathUtils.lerp(steering.current, turn, 7 * delta);

      carRef.current.rotation.y +=
        steering.current * delta * 1.6 * Math.min(1, Math.abs(velocity.current) / 4);

      const forward = new THREE.Vector3(0, 0, 1);
      forward.applyQuaternion(carRef.current.quaternion);
      const deltaMove = forward.multiplyScalar(velocity.current * delta);

      let next = moveWithSlide(
        carRef.current.position,
        deltaMove,
        mapRef.current,
        2.0
      );

      if (mapBounds.current) {
        const b = mapBounds.current;
        next.x = clamp(next.x, b.minX, b.maxX);
        next.z = clamp(next.z, b.minZ, b.maxZ);
      }

      carRef.current.position.x = next.x;
      carRef.current.position.z = next.z;
      carRef.current.position.y = stickToGround(
        carRef.current.position,
        mapRef.current,
        0.12
      );

      if (playerRef.current) {
        playerRef.current.position.copy(carRef.current.position);
      }
    }

    if (velocityRef) velocityRef.current = velocity.current;

    const spin = velocity.current * delta * 2.4;
    const wheels = wheelsRef.current || [];
    for (let i = 0; i < wheels.length; i++) {
      if (wheels[i]) wheels[i].rotation.x += spin;
    }
  });

  return (
    <group ref={carRef} position={[0, 8, 0]}>
      <CarModel key={carPath} path={carPath} wheelsRef={wheelsRef} />
    </group>
  );
}

function PlayerController({
  playerRef,
  inCar,
  mapBounds,
  mapRef,
  setIsMoving,
  setNearGarage
}) {
  const velocity = useRef(new THREE.Vector3());
  const groundedOnce = useRef(false);

  useFrame((_, delta) => {
    if (!playerRef.current || inCar) {
      setIsMoving(false);
      if (setNearGarage) setNearGarage(false);
      return;
    }

    // Spawn no chão
    if (mapRef.current && !groundedOnce.current) {
      const gy = sampleGroundY(
        mapRef.current,
        playerRef.current.position.x,
        playerRef.current.position.z
      );
      playerRef.current.position.y = gy;
      groundedOnce.current = true;
    }

    const keys = window.__keys || {};
    const joy = window.__joystick || { x: 0, y: 0 };

    const camYaw = window.__camera.yaw;
    const inputX = (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + joy.x;
    const inputZ = (keys.s ? 1 : 0) - (keys.w ? 1 : 0) + joy.y;

    const direction = new THREE.Vector3(
      inputX * Math.cos(camYaw) + inputZ * Math.sin(camYaw),
      0,
      -inputX * Math.sin(camYaw) + inputZ * Math.cos(camYaw)
    );

    if (direction.lengthSq() > 1) direction.normalize();

    const moving = direction.lengthSq() > 0.02;
    setIsMoving(moving);

    const speed = 6.0;
    velocity.current.lerp(
      direction.clone().multiplyScalar(speed),
      1 - Math.pow(0.0008, delta)
    );

    const deltaMove = velocity.current.clone().multiplyScalar(delta);

    let next = moveWithSlide(
      playerRef.current.position,
      deltaMove,
      mapRef.current,
      0.45
    );

    if (mapBounds.current) {
      const b = mapBounds.current;
      next.x = clamp(next.x, b.minX, b.maxX);
      next.z = clamp(next.z, b.minZ, b.maxZ);
    }

    playerRef.current.position.x = next.x;
    playerRef.current.position.z = next.z;
    playerRef.current.position.y = stickToGround(
      playerRef.current.position,
      mapRef.current,
      0
    );

    // Garagem usa Y do chão também na distância XZ
    const dx = playerRef.current.position.x - GARAGE_POS.x;
    const dz = playerRef.current.position.z - GARAGE_POS.z;
    const distGarage = Math.sqrt(dx * dx + dz * dz);
    setNearGarage(distGarage < GARAGE_RADIUS);

    if (moving) {
      playerRef.current.rotation.y = Math.atan2(direction.x, direction.z);
    }
  });

  return null;
}

function CameraController({ target, inCar, mapRef, carVelocityRef }) {
  const { camera } = useThree();
  const yaw = useRef(window.__camera.yaw);
  const pitch = useRef(0.28);
  const smoothPos = useRef(null);
  const followPath = useRef(true);
  const wasMoving = useRef(false);

  useFrame((_, delta) => {
    if (!target.current) return;

    const targetPos = target.current.position;
    const dt = Math.min(delta, 0.05);
    const speed = carVelocityRef?.current ?? 0;
    const moving = Math.abs(speed) > 1.0;

    if (inCar && moving && !wasMoving.current) {
      followPath.current = true;
    }
    wasMoving.current = inCar && moving;

    if (window.__cameraLooked) {
      followPath.current = false;
      window.__cameraLooked = false;
    }

    let desiredYaw;
    let desiredPitch;
    let desiredDist;
    let lookHeight;
    let turnSpeed;

    if (inCar && followPath.current) {
      const forward = new THREE.Vector3(0, 0, 1);
      forward.applyQuaternion(target.current.quaternion);

      const reversing = speed < -1.0;
      const travel = reversing ? forward.clone().negate() : forward;

      desiredYaw = Math.atan2(travel.x, travel.z) + Math.PI;
      desiredPitch = 0.3;
      desiredDist = 13;
      lookHeight = 1.15;
      turnSpeed = moving ? 5.5 : 3.5;

      window.__camera.yaw = yaw.current;
      window.__camera.pitch = pitch.current;
    } else {
      desiredYaw = window.__camera.yaw;
      desiredPitch = clamp(window.__camera.pitch, 0.12, 0.75);
      desiredDist = inCar ? 13 : 8.5;
      lookHeight = inCar ? 1.2 : 1.1;
      turnSpeed = 14;
    }

    let dy = desiredYaw - yaw.current;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    yaw.current += dy * Math.min(1, turnSpeed * dt);
    pitch.current += (desiredPitch - pitch.current) * Math.min(1, 8 * dt);

    const offset = new THREE.Vector3(
      Math.sin(yaw.current) * Math.cos(pitch.current) * desiredDist,
      Math.sin(pitch.current) * desiredDist + (inCar ? 1.55 : 1.2),
      Math.cos(yaw.current) * Math.cos(pitch.current) * desiredDist
    );

    let desiredPos = targetPos.clone().add(offset);
    desiredPos.y = Math.max(desiredPos.y, targetPos.y + 2.4);

    if (mapRef.current) {
      const ray = new THREE.Raycaster();
      const from = targetPos.clone();
      from.y += 1.2;
      const dir = desiredPos.clone().sub(from).normalize();
      const dist = from.distanceTo(desiredPos);
      ray.set(from, dir);
      ray.far = dist;
      const hits = ray.intersectObject(mapRef.current, true);
      if (hits.length > 0 && hits[0].distance < dist - 0.4) {
        desiredPos = from
          .clone()
          .add(dir.multiplyScalar(Math.max(2.8, hits[0].distance - 0.7)));
        desiredPos.y = Math.max(desiredPos.y, targetPos.y + 2.0);
      }
    }

    if (!smoothPos.current) {
      smoothPos.current = desiredPos.clone();
    } else {
      smoothPos.current.lerp(desiredPos, Math.min(1, 9 * dt));
    }

    camera.position.copy(smoothPos.current);
    camera.lookAt(targetPos.x, targetPos.y + lookHeight, targetPos.z);
  });

  return null;
}

function Game({ setMessage, carPath, setNearGarage, garageOpen }) {
  const playerRef = useRef();
  const carRef = useRef();
  const mapRef = useRef();
  const mapBounds = useRef(null);
  const carVelocityRef = useRef(0);

  const [inCar, setInCar] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    const down = (e) => {
      window.__keys[e.key.toLowerCase()] = true;
    };
    const up = (e) => {
      window.__keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (garageOpen) return;
    setMessage(
      inCar
        ? "E = sair  •  Arraste = 360°  •  Andar = câmera do caminho"
        : "E = carro  |  G = garagem"
    );
  }, [inCar, setMessage, garageOpen]);

  useEffect(() => {
    const tryCar = () => {
      if (window.__garageOpen) return;
      if (!carRef.current) return;

      if (inCar) {
        setInCar(false);
        if (playerRef.current) {
          const exitPos = new THREE.Vector3(-3.2, 0, 0);
          exitPos.applyQuaternion(carRef.current.quaternion);
          exitPos.add(carRef.current.position);
          if (mapRef.current) {
            exitPos.y = sampleGroundY(mapRef.current, exitPos.x, exitPos.z);
          }
          playerRef.current.position.copy(exitPos);
        }
        setMessage("Você saiu do carro");
        return;
      }

      if (playerRef.current) {
        const distance = playerRef.current.position.distanceTo(
          carRef.current.position
        );
        if (distance < 7) {
          setInCar(true);
          setMessage("Você entrou no carro");
        }
      }
    };

    window.__toggleCar = tryCar;

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === "e" && !window.__ePressed) {
        window.__ePressed = true;
        tryCar();
      }
      if (k === "g" && !window.__gPressed) {
        window.__gPressed = true;
        if (window.__openGarageIfNear) window.__openGarageIfNear();
      }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === "e") window.__ePressed = false;
      if (k === "g") window.__gPressed = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      delete window.__toggleCar;
    };
  }, [inCar, setMessage]);

  return (
    <>
      <DriftTower mapRef={mapRef} mapBounds={mapBounds} />
      <GarageMarker mapRef={mapRef} />

      <Car
        carRef={carRef}
        playerRef={playerRef}
        inCar={inCar}
        mapBounds={mapBounds}
        mapRef={mapRef}
        carPath={carPath}
        velocityRef={carVelocityRef}
      />

      <Player playerRef={playerRef} inCar={inCar} isMoving={isMoving} />

      <PlayerController
        playerRef={playerRef}
        inCar={inCar}
        mapBounds={mapBounds}
        mapRef={mapRef}
        setIsMoving={setIsMoving}
        setNearGarage={setNearGarage}
      />

      <CameraController
        target={inCar ? carRef : playerRef}
        inCar={inCar}
        mapRef={mapRef}
        carVelocityRef={carVelocityRef}
      />

      <ambientLight intensity={1.15} />
      <directionalLight
        position={[60, 90, 40]}
        intensity={2.3}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-near={1}
        shadow-camera-far={300}
      />
      <hemisphereLight args={["#87ceeb", "#4a5a4a", 0.5]} />
      <fog attach="fog" args={["#b0c4d0", 60, 230]} />
    </>
  );
}

function GarageMenu({ open, currentId, onSelect, onClose }) {
  if (!open) return null;
  return (
    <div className="garage-panel">
      <div className="garage-card">
        <h2>GARAGEM</h2>
        <p>Escolha o carro</p>
        <div className="garage-list">
          {CAR_CATALOG.map((car) => (
            <button
              key={car.id}
              className={
                "garage-item" + (car.id === currentId ? " selected" : "")
              }
              onClick={() => onSelect(car)}
            >
              {car.name}
            </button>
          ))}
        </div>
        <button className="garage-close" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function Joystick() {
  const baseRef = useRef();
  const knobRef = useRef();
  const active = useRef(false);

  function move(e) {
    if (!active.current || !baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;

    let x = e.clientX - centerX;
    let y = e.clientY - centerY;
    const length = Math.sqrt(x * x + y * y);
    if (length > radius) {
      x = (x / length) * radius;
      y = (y / length) * radius;
    }

    window.__joystick.x = x / radius;
    window.__joystick.y = y / radius;

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  function start(e) {
    active.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e);
  }

  function end() {
    active.current = false;
    window.__joystick.x = 0;
    window.__joystick.y = 0;
    if (knobRef.current) {
      knobRef.current.style.transform = "translate(0px, 0px)";
    }
  }

  return (
    <div
      className="joystick"
      ref={baseRef}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => {
        if (active.current) end();
      }}
    >
      <div className="joystick-knob" ref={knobRef} />
    </div>
  );
}

function ActionButton() {
  return (
    <button
      className="action-button"
      onPointerDown={() => {
        if (window.__toggleCar) window.__toggleCar();
      }}
    >
      E
    </button>
  );
}

function GarageButton({ visible }) {
  return (
    <button
      className={"garage-button" + (visible ? " visible" : "")}
      onPointerDown={() => {
        if (window.__openGarageIfNear) window.__openGarageIfNear();
      }}
    >
      G
    </button>
  );
}

function CameraTouch() {
  const active = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  function start(e) {
    if (
      e.target.closest(".joystick") ||
      e.target.closest(".action-button") ||
      e.target.closest(".garage-button") ||
      e.target.closest(".garage-panel")
    )
      return;
    active.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  }

  function move(e) {
    if (!active.current) return;

    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };

    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      window.__cameraLooked = true;
    }

    window.__camera.yaw -= dx * 0.0055;
    window.__camera.pitch = clamp(
      window.__camera.pitch - dy * 0.0038,
      0.12,
      0.75
    );
  }

  function end() {
    active.current = false;
  }

  return (
    <div
      className="camera-touch"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}

function App() {
  const [started, setStarted] = useState(false);
  const [message, setMessage] = useState("");
  const [nearGarage, setNearGarage] = useState(false);
  const [garageOpen, setGarageOpen] = useState(false);
  const [carId, setCarId] = useState("350z");

  const carPath =
    CAR_CATALOG.find((c) => c.id === carId)?.file || "/models/350z.glb";

  useEffect(() => {
    window.__garageOpen = garageOpen;
    window.__openGarageIfNear = () => {
      if (nearGarage && !garageOpen) setGarageOpen(true);
    };
    return () => {
      delete window.__garageOpen;
      delete window.__openGarageIfNear;
    };
  }, [garageOpen, nearGarage]);

  function selectCar(car) {
    setCarId(car.id);
    setGarageOpen(false);
    setMessage("Carro: " + car.name);
  }

  return (
    <div className="app">
      {!started && (
        <div className="menu">
          <div className="menu-card">
            <div className="logo">MINI CITY</div>
            <div className="subtitle">OPEN WORLD 3D</div>
            <p>Torre com rampa espiral · E = carro · G = garagem</p>
            <button className="play-button" onClick={() => setStarted(true)}>
              JOGAR
            </button>
            <div className="controls-info">
              <span>🕹️ Analógico</span>
              <span>G Garagem</span>
              <span>E Carro</span>
            </div>
          </div>
        </div>
      )}

      {started && (
        <>
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [0, 20, 25], fov: 55, near: 0.1, far: 500 }}
            gl={{ antialias: true }}
          >
            <Sky sunPosition={[80, 30, 40]} />
            <Game
              setMessage={setMessage}
              carPath={carPath}
              setNearGarage={setNearGarage}
              garageOpen={garageOpen}
            />
          </Canvas>

          <CameraTouch />
          <div className="hud">
            <div className="game-title">MINI CITY</div>
            <div className="message">{message}</div>
          </div>

          <div
            className={
              "garage-marker-label" +
              (nearGarage && !garageOpen ? " visible" : "")
            }
          >
            GARAGEM — aperte G
          </div>

          <Joystick />
          <ActionButton />
          <GarageButton visible={nearGarage && !garageOpen} />
          <div className="camera-help">
            Arraste: 360° fixo · Acelerar/ré: câmera do caminho
          </div>

          <GarageMenu
            open={garageOpen}
            currentId={carId}
            onSelect={selectCar}
            onClose={() => setGarageOpen(false)}
          />
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
