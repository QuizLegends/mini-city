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
  useAnimations
} from "@react-three/drei";

import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import "./style.css";

window.__keys = {};
window.__joystick = { x: 0, y: 0 };
window.__camera = { yaw: 0, pitch: 0.32 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const CAR_CATALOG = [
  { id: "350z", name: "Nissan 350Z", file: "/models/350z.glb" },
  { id: "evo-amarelo", name: "Evolution Amarelo", file: "/models/Evolution-amarelo.glb" },
  { id: "evo-vermelho", name: "Evolution Vermelho", file: "/models/Evolution-vermelho.glb" },
  { id: "rx7", name: "Mazda RX-7", file: "/models/RX7.glb" },
  { id: "skyline", name: "Skyline", file: "/models/Skyline.glb" },
  { id: "supra", name: "Supra", file: "/models/Supra.glb" }
];

const GARAGE_POS = new THREE.Vector3(0, 0, 18);
const GARAGE_RADIUS = 12;

function getWorldNormal(hit) {
  if (!hit.face || !hit.object) return new THREE.Vector3(0, 1, 0);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
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
  const origin = new THREE.Vector3(pos.x, pos.y + 2.5, pos.z);
  ray.set(origin, new THREE.Vector3(0, -1, 0));
  ray.far = 6;

  const hits = ray.intersectObject(mapObject, true);
  let best = null;

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const n = getWorldNormal(hit);
    if (n.y < 0.5) continue;
    if (hit.point.y > pos.y + 0.85) continue;
    if (hit.point.y < pos.y - 3.5) continue;
    if (!best || hit.distance < best.distance) best = hit;
  }

  if (best) return best.point.y + yOffset;
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
      position={[0, 0, 0]}
      visible={!inCar}
      dispose={null}
    >
      <primitive object={clone} />
    </group>
  );
}

useGLTF.preload(CHAR_PATH);

function MapWorld({ mapRef, mapBounds }) {
  const { scene } = useGLTF("/models/mapa.glb");

  const model = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetSize = 160;
    const currentSize = Math.max(size.x, size.z);
    const scale = currentSize > 0.01 ? targetSize / currentSize : 1;
    clone.scale.setScalar(scale);

    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center.multiplyScalar(scale));

    const box2 = new THREE.Box3().setFromObject(clone);
    clone.position.y -= box2.min.y;

    const finalBox = new THREE.Box3().setFromObject(clone);
    if (mapBounds) {
      mapBounds.current = {
        minX: finalBox.min.x + 2,
        maxX: finalBox.max.x - 2,
        minZ: finalBox.min.z + 2,
        maxZ: finalBox.max.z - 2
      };
    }

    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return clone;
  }, [scene, mapBounds]);

  return <primitive ref={mapRef} object={model} />;
}

useGLTF.preload("/models/mapa.glb");

function GarageMarker() {
  return (
    <group position={[GARAGE_POS.x, 0, GARAGE_POS.z]}>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[14, 0.16, 14]} />
        <meshStandardMaterial
          color="#0d2838"
          emissive="#00a0c0"
          emissiveIntensity={0.35}
        />
      </mesh>
      {[-5, 5].map((x) =>
        [-5, 5].map((z) => (
          <mesh key={x + "-" + z} position={[x, 2, z]} castShadow>
            <boxGeometry args={[0.5, 4, 0.5]} />
            <meshStandardMaterial color="#1a2a35" metalness={0.4} />
          </mesh>
        ))
      )}
      <mesh position={[0, 4, 0]} castShadow>
        <boxGeometry args={[1.6, 8, 1.6]} />
        <meshStandardMaterial color="#102028" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 7.2, 0.9]}>
        <boxGeometry args={[3.2, 1.2, 0.2]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={2}
        />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4, 5.5, 32]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={1.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight position={[0, 6, 0]} intensity={1.4} distance={22} color="#00e5ff" />
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

  useFrame((_, delta) => {
    if (!carRef.current) return;

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
    <group ref={carRef} position={[0, 0.2, 0]}>
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

  useFrame((_, delta) => {
    if (!playerRef.current || inCar) {
      setIsMoving(false);
      if (setNearGarage) setNearGarage(false);
      return;
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

    const distGarage = playerRef.current.position.distanceTo(GARAGE_POS);
    setNearGarage(distGarage < GARAGE_RADIUS);

    if (moving) {
      playerRef.current.rotation.y = Math.atan2(direction.x, direction.z);
    }
  });

  return null;
}

/**
 * Câmera:
 * - 360° livre e PERMANECE onde você olhou (lateral, etc.)
 * - Só quando o carro se move (frente/ré) volta para a câmera do caminho
 */
function CameraController({ target, inCar, mapRef, carVelocityRef }) {
  const { camera } = useThree();
  const yaw = useRef(window.__camera.yaw);
  const pitch = useRef(0.28);
  const smoothPos = useRef(null);

  // true = usuário está no modo livre (não força caminho)
  // false = seguir direção do movimento
  const followPath = useRef(true);
  const wasMoving = useRef(false);

  useFrame((_, delta) => {
    if (!target.current) return;

    const targetPos = target.current.position;
    const dt = Math.min(delta, 0.05);
    const speed = carVelocityRef?.current ?? 0;
    const moving = Math.abs(speed) > 1.0;

    // Acabou de começar a andar → reativa câmera do caminho
    if (inCar && moving && !wasMoving.current) {
      followPath.current = true;
    }
    wasMoving.current = inCar && moving;

    // Se arrastou a tela, entra em 360° livre e FICA
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
      // Câmera do caminho (só com movimento ou até o usuário olhar)
      const forward = new THREE.Vector3(0, 0, 1);
      forward.applyQuaternion(target.current.quaternion);

      const reversing = speed < -1.0;
      const travel = reversing ? forward.clone().negate() : forward;

      desiredYaw = Math.atan2(travel.x, travel.z) + Math.PI;
      desiredPitch = 0.3;
      desiredDist = 13;
      lookHeight = 1.15;
      turnSpeed = moving ? 5.5 : 3.5;

      // sincroniza __camera para o livre continuar de onde parou
      window.__camera.yaw = yaw.current;
      window.__camera.pitch = pitch.current;
    } else {
      // 360° livre — usa exatamente o que o toque definiu
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
      <GarageMarker />

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

    // marca que o jogador quer 360° livre (não puxar de volta)
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
            <p>Arraste = 360° · Andar com o carro = câmera do caminho</p>
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
            camera={{ position: [0, 10, 16], fov: 55, near: 0.1, far: 300 }}
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
