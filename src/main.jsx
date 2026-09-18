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
   MAPA LOCAL
========================================================= */

const MAP_URL = "/models/mapa.glb";

const CAR_CATALOG = [
  { id: "350z", name: "Nissan 350Z", file: "/models/350z.glb" },
  { id: "evo-amarelo", name: "Evolution Amarelo", file: "/models/Evolution-amarelo.glb" },
  { id: "evo-vermelho", name: "Evolution Vermelho", file: "/models/Evolution-vermelho.glb" },
  { id: "rx7", name: "Mazda RX-7", file: "/models/RX7.glb" },
  { id: "skyline", name: "Skyline", file: "/models/Skyline.glb" },
  { id: "supra", name: "Supra", file: "/models/Supra.glb" }
];

// Dimensões da estrutura física da garagem (mantida pequena)
const GARAGE_WIDTH = 7;
const GARAGE_DEPTH = 6.2;
const GARAGE_WALL_HEIGHT = 2.9;

// Portão do tamanho exato da frente da garagem (sem vãos visíveis pras laterais)
const DOOR_WIDTH = GARAGE_WIDTH - 0.5;
const DOOR_HEIGHT = GARAGE_WALL_HEIGHT;

// Garagem: XZ no mapa — Y é ajustado no chão
// Posição base era (0,0,18) com o portão virado para +Z (o mesmo sentido da reta do spawn).
// "1 espaço" = o tamanho da própria garagem (usamos a largura, 7 unidades) para os dois eixos.
// Movida 4 espaços PARA FRENTE (sentido em que o portão apontava: +Z) e 5 espaços PARA A
// ESQUERDA em relação a esse mesmo portão (-X, considerando quem está "saindo" pelo portão).
const GARAGE_SPACE_UNIT = GARAGE_WIDTH;
const GARAGE_POS = new THREE.Vector3(
  0 + 5 * GARAGE_SPACE_UNIT - 2 * GARAGE_SPACE_UNIT - 0.5 * GARAGE_SPACE_UNIT, // ... depois +0,5 espaço p/ frente do portão (-X)
  0,
  18 + 4 * GARAGE_SPACE_UNIT - 0.5 * GARAGE_SPACE_UNIT // 4 espaços p/ frente + 0,5 espaço p/ direita do portão (-Z)
);
const GARAGE_RADIUS = 7;

// A pista deve começar poucos "espaços" (GARAGE_SPACE_UNIT) à frente da
// garagem, medidos sobre a mesma reta do spawn (eixo Z, com X = 0).
// Ajuste TRACK_GAP_SPACES para aproximar/afastar a pista da garagem.
const TRACK_GAP_SPACES = -9;
const TRACK_START_Z = GARAGE_POS.z + TRACK_GAP_SPACES * GARAGE_SPACE_UNIT;

// Giro de 90° (1/4 de 360°) para a direita: o portão, que apontava para +Z,
// passa a apontar para +X (fica virado para o lado direito).
const GARAGE_ROTATION_Y = -Math.PI / 2;

// Colisão da garagem: como ela está girada 90°, a largura e a profundidade
// trocam de eixo no mundo (largura passa a se estender em Z, profundidade em X).
const GARAGE_COLLISION_HALF_X = GARAGE_DEPTH / 2 + 0.15;
const GARAGE_COLLISION_HALF_Z = GARAGE_WIDTH / 2 + 0.15;

/** Empurra o jogador/carro para fora da caixa sólida da garagem, se estiver entrando nela. */
function resolveGarageCollision(pos, entityRadius) {
  const halfX = GARAGE_COLLISION_HALF_X + entityRadius;
  const halfZ = GARAGE_COLLISION_HALF_Z + entityRadius;
  const dx = pos.x - GARAGE_POS.x;
  const dz = pos.z - GARAGE_POS.z;

  if (Math.abs(dx) >= halfX || Math.abs(dz) >= halfZ) return pos;

  const penX = halfX - Math.abs(dx);
  const penZ = halfZ - Math.abs(dz);
  const result = pos.clone();

  if (penX < penZ) {
    result.x = GARAGE_POS.x + Math.sign(dx || 1) * halfX;
  } else {
    result.z = GARAGE_POS.z + Math.sign(dz || 1) * halfZ;
  }
  return result;
}

function getWorldNormal(hit) {
  if (!hit.face || !hit.object) return new THREE.Vector3(0, 1, 0);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
}

/** Raycast para achar altura do chão */
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

function stickToGround(pos, mapObject, yOffset) {
  if (!mapObject) return pos.y;

  const ray = new THREE.Raycaster();
  // começa bem acima para não nascer embaixo do mapa
  const origin = new THREE.Vector3(pos.x, pos.y + 40, pos.z);
  ray.set(origin, new THREE.Vector3(0, -1, 0));
  ray.far = 80;

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

/**
 * Pista reta que começa exatamente no limite do mapa importado (no eixo Z,
 * a mesma reta que sai do spawn) e segue em frente por uma longa distância,
 * com barreiras metálicas dos dois lados (e uma no final) para o carro não
 * sair da pista nem cair no vazio.
 */
function buildStraightTrack({ startZ, length, width, x = 0 }) {
  const group = new THREE.Group();

  // Pista de asfalto
  const roadGeo = new THREE.BoxGeometry(width, 0.3, length);
  const roadMat = new THREE.MeshStandardMaterial({
    color: "#3a3a3d",
    roughness: 0.9,
    metalness: 0.05
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.position.set(x, -0.15, startZ + length / 2);
  road.receiveShadow = true;
  group.add(road);

  // Faixas de borda (brancas), perto das barreiras
  [-1, 1].forEach((side) => {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.02, length - 2),
      new THREE.MeshStandardMaterial({ color: "#e9e9e4", roughness: 0.6 })
    );
    edge.position.set(x + side * (width / 2 - 0.6), 0.005, startZ + length / 2);
    group.add(edge);
  });

  // Barreiras metálicas laterais (impedem sair da pista)
  const barrierHeight = 0.9;
  const barrierMat = new THREE.MeshStandardMaterial({
    color: "#4a4f52",
    roughness: 0.55,
    metalness: 0.4
  });
  [-1, 1].forEach((side) => {
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, barrierHeight, length),
      barrierMat
    );
    barrier.position.set(
      x + side * (width / 2 + 0.15),
      barrierHeight / 2,
      startZ + length / 2
    );
    barrier.castShadow = true;
    barrier.receiveShadow = true;
    group.add(barrier);

    // Postes de sustentação a cada ~10 unidades (só visual)
    const postCount = Math.floor(length / 10);
    const postMat = new THREE.MeshStandardMaterial({
      color: "#2b2f33",
      roughness: 0.5,
      metalness: 0.5
    });
    for (let i = 0; i <= postCount; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, barrierHeight + 0.2, 6),
        postMat
      );
      post.position.set(
        x + side * (width / 2 + 0.15),
        (barrierHeight + 0.2) / 2,
        startZ + i * 10
      );
      post.castShadow = true;
      group.add(post);
    }
  });

  // Barreira no final da pista (evita voar pra fora do fim da reta)
  const endBarrier = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.6, barrierHeight, 0.3),
    barrierMat
  );
  endBarrier.position.set(x, barrierHeight / 2, startZ + length - 0.15);
  endBarrier.castShadow = true;
  endBarrier.receiveShadow = true;
  group.add(endBarrier);

  return group;
}

function MapWorld({ mapRef, mapBounds, onMapReady }) {
  const { scene } = useGLTF(MAP_URL);

  const model = useMemo(() => {
    const clone = scene.clone(true);

    // Garante matriz atualizada
    clone.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetSize = 160;
    const currentSize = Math.max(size.x, size.z, 0.01);
    const scale = targetSize / currentSize;
    clone.scale.setScalar(scale);
    clone.updateMatrixWorld(true);

    // Centraliza XZ e apoia o chão em Y = 0
    const box2 = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= box2.min.y;
    clone.updateMatrixWorld(true);

    // Continuação: pista reta bem grande, começando 5 espaços à frente da
    // garagem (na mesma reta do spawn, eixo Z / X = 0), bem perto da cidade
    // em vez de longe, no limite do mapa importado.
    const track = buildStraightTrack({
      startZ: TRACK_START_Z,
      length: 400,
      width: 16,
      x: 0
    });
    clone.add(track);
    clone.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(clone);
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

    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    if (onMapReady) {
      // avisa no próximo tick (ref do mapa já montado)
      queueMicrotask(() => onMapReady(clone));
    }

    return clone;
  }, [scene, mapBounds, onMapReady]);

  return <primitive ref={mapRef} object={model} />;
}

useGLTF.preload(MAP_URL);

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

  // Réguas do portão de enrolar — agora ocupa toda a largura/altura da frente
  const doorSlats = useMemo(() => {
    const count = 8;
    const h = DOOR_HEIGHT / count;
    return Array.from({ length: count }, (_, i) => ({
      y: -DOOR_HEIGHT / 2 + h * i + h / 2,
      h
    }));
  }, []);

  return (
    <group
      ref={groupRef}
      position={[GARAGE_POS.x, 0, GARAGE_POS.z]}
      rotation={[0, GARAGE_ROTATION_Y, 0]}
    >
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

      {/* Portão de enrolar com réguas — mesma largura/altura da parede da frente */}
      <group position={[0, GARAGE_WALL_HEIGHT / 2 + 0.1, GARAGE_DEPTH / 2 - 0.02]}>
        {doorSlats.map((s, i) => (
          <mesh key={"door-slat-" + i} position={[0, s.y, 0]} castShadow receiveShadow>
            <boxGeometry args={[DOOR_WIDTH, s.h - 0.03, 0.1]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#d8d8d2" : "#c4c4be"}
              metalness={0.25}
              roughness={0.4}
            />
          </mesh>
        ))}
        {/* Moldura da porta */}
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[DOOR_WIDTH + 0.15, DOOR_HEIGHT + 0.12, 0.04]} />
          <meshStandardMaterial color="#1c1f22" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Puxador central */}
        <mesh position={[0, -DOOR_HEIGHT / 2 + 0.4, 0.08]}>
          <boxGeometry args={[0.6, 0.08, 0.06]} />
          <meshStandardMaterial color="#101214" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      {/* Batentes finos entre o portão e os pilares de canto */}
      {[-(DOOR_WIDTH / 2 + 0.09), DOOR_WIDTH / 2 + 0.09].map((x) => (
        <mesh
          key={"jamb-" + x}
          position={[x, GARAGE_WALL_HEIGHT / 2 + 0.1, GARAGE_DEPTH / 2 - 0.02]}
          castShadow
        >
          <boxGeometry args={[0.14, GARAGE_WALL_HEIGHT, 0.18]} />
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

      next = resolveGarageCollision(next, 2.0);

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

    next = resolveGarageCollision(next, 0.45);

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
      <MapWorld mapRef={mapRef} mapBounds={mapBounds} />
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
        position={[40, 55, 25]}
        intensity={2.3}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight args={["#87ceeb", "#4a5a4a", 0.5]} />
      <fog attach="fog" args={["#b0c4d0", 50, 140]} />
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
            <p>Mapa local · E = carro · G = garagem</p>
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
            camera={{ position: [0, 20, 25], fov: 55, near: 0.1, far: 400 }}
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
