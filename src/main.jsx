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

/* =========================================================
   LISTA DA GARAGEM
========================================================= */

const CAR_CATALOG = [
  { id: "350z", name: "Nissan 350Z", file: "/models/350z.glb" },
  { id: "evo-amarelo", name: "Evolution Amarelo", file: "/models/Evolution-amarelo.glb" },
  { id: "evo-vermelho", name: "Evolution Vermelho", file: "/models/Evolution-vermelho.glb" },
  { id: "eclipse-spyder", name: "Eclipse Spyder", file: "/models/Eclipse-spyder.glb" },
  { id: "eclipse", name: "Eclipse", file: "/models/Eclipse.glb" },
  { id: "rx7", name: "Mazda RX-7", file: "/models/RX7.glb" },
  { id: "skyline", name: "Skyline", file: "/models/Skyline.glb" },
  { id: "supra", name: "Supra", file: "/models/Supra.glb" }
];

// Posição da garagem no mapa (ajuste se quiser)
const GARAGE_POS = new THREE.Vector3(12, 0, -8);
const GARAGE_RADIUS = 8;

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


/* =========================================================
   PERSONAGEM
========================================================= */

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


/* =========================================================
   MAPA
========================================================= */

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


/* =========================================================
   MARCADOR DA GARAGEM (bloco + luz)
========================================================= */

function GarageMarker() {
  return (
    <group position={[GARAGE_POS.x, 0, GARAGE_POS.z]}>
      {/* piso */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[10, 0.1, 10]} />
        <meshStandardMaterial color="#1a3040" emissive="#0a2030" emissiveIntensity={0.4} />
      </mesh>
      {/* totem */}
      <mesh position={[0, 1.5, -4]} castShadow>
        <boxGeometry args={[1.2, 3, 0.4]} />
        <meshStandardMaterial color="#223" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.6, -3.7]}>
        <boxGeometry args={[1.4, 0.7, 0.15]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={1.2}
        />
      </mesh>
      <pointLight position={[0, 3, -3]} intensity={0.8} distance={14} color="#00e5ff" />
    </group>
  );
}


/* =========================================================
   CARRO (modelo trocável)
========================================================= */

function CarModel({ path }) {
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

    return c;
  }, [scene]);

  return <primitive object={model} />;
}

// preload todos
CAR_CATALOG.forEach((c) => useGLTF.preload(c.file));

function Car({
  carRef,
  playerRef,
  inCar,
  mapBounds,
  mapRef,
  carPath
}) {
  const velocity = useRef(0);
  const steering = useRef(0);

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
  });

  return (
    <group ref={carRef} position={[0, 0.2, 0]}>
      <CarModel key={carPath} path={carPath} />
    </group>
  );
}


/* =========================================================
   CONTROLE A PÉ
========================================================= */

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
      return;
    }

    const keys = window.__keys || {};
    const joy = window.__joystick || { x: 0, y: 0 };

    const yaw = window.__camera.yaw;
    const inputX = (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + joy.x;
    const inputZ = (keys.s ? 1 : 0) - (keys.w ? 1 : 0) + joy.y;

    const direction = new THREE.Vector3(
      inputX * Math.cos(yaw) + inputZ * Math.sin(yaw),
      0,
      -inputX * Math.sin(yaw) + inputZ * Math.cos(yaw)
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

    // perto da garagem?
    const distGarage = playerRef.current.position.distanceTo(GARAGE_POS);
    setNearGarage(distGarage < GARAGE_RADIUS);

    if (moving) {
      playerRef.current.rotation.y = Math.atan2(direction.x, direction.z);
    }
  });

  return null;
}


/* =========================================================
   CÂMERA
========================================================= */

function CameraController({ target, inCar, mapRef }) {
  const { camera } = useThree();

  useFrame(() => {
    if (!target.current) return;

    const targetPos = target.current.position;
    const idealDistance = inCar ? 13 : 8.5;
    const yaw = window.__camera.yaw;
    const pitch = clamp(window.__camera.pitch, 0.12, 0.75);

    const offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch) * idealDistance,
      Math.sin(pitch) * idealDistance + (inCar ? 1.5 : 1.2),
      Math.cos(yaw) * Math.cos(pitch) * idealDistance
    );

    let desired = targetPos.clone().add(offset);
    desired.y = Math.max(desired.y, targetPos.y + 2.5);

    if (mapRef.current) {
      const ray = new THREE.Raycaster();
      const from = targetPos.clone();
      from.y += 1.2;
      const dir = desired.clone().sub(from).normalize();
      const dist = from.distanceTo(desired);
      ray.set(from, dir);
      ray.far = dist;
      const hits = ray.intersectObject(mapRef.current, true);
      if (hits.length > 0 && hits[0].distance < dist - 0.4) {
        desired = from
          .clone()
          .add(dir.multiplyScalar(Math.max(2.5, hits[0].distance - 0.6)));
        desired.y = Math.max(desired.y, targetPos.y + 2.0);
      }
    }

    camera.position.lerp(desired, 0.12);
    camera.lookAt(
      targetPos.x,
      targetPos.y + (inCar ? 1.3 : 1.1),
      targetPos.z
    );
  });

  return null;
}


/* =========================================================
   GAME
========================================================= */

function Game({
  setMessage,
  carPath,
  setNearGarage,
  garageOpen
}) {
  const playerRef = useRef();
  const carRef = useRef();
  const mapRef = useRef();
  const mapBounds = useRef(null);

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
        ? "DIRIGINDO  •  E = sair"
        : "E = entrar no carro  |  Garagem: totem ciano"
    );
  }, [inCar, setMessage, garageOpen]);

  useEffect(() => {
    const tryToggle = () => {
      // Se a App abriu a garagem, não entra no carro neste frame
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

      // Perto da garagem → abre menu (tratado na App)
      if (playerRef.current) {
        const dG = playerRef.current.position.distanceTo(GARAGE_POS);
        if (dG < GARAGE_RADIUS) {
          if (window.__openGarage) window.__openGarage();
          return;
        }
      }

      // Perto do carro → entrar
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

    window.__toggleCar = tryToggle;

    const onKeyDown = (e) => {
      if (e.key.toLowerCase() === "e" && !window.__ePressed) {
        window.__ePressed = true;
        tryToggle();
      }
    };
    const onKeyUp = (e) => {
      if (e.key.toLowerCase() === "e") window.__ePressed = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      delete window.__toggleCar;
    };
  }, [inCar, setMessage]);

  // Ao trocar de carro, se estava dirigindo, continua no mesmo lugar
  useEffect(() => {
    // força re-mount visual only
  }, [carPath]);

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
      />

      <Player
        playerRef={playerRef}
        inCar={inCar}
        isMoving={isMoving}
      />

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


/* =========================================================
   UI GARAGEM
========================================================= */

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


/* =========================================================
   UI CONTROLES
========================================================= */

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

function CameraTouch() {
  const active = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  function start(e) {
    if (
      e.target.closest(".joystick") ||
      e.target.closest(".action-button") ||
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


/* =========================================================
   APP
========================================================= */

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
    window.__openGarage = () => setGarageOpen(true);
    return () => {
      delete window.__garageOpen;
      delete window.__openGarage;
    };
  }, [garageOpen]);

  function selectCar(car) {
    setCarId(car.id);
    setGarageOpen(false);
    setMessage("Carro selecionado: " + car.name);
  }

  return (
    <div className="app">
      {!started && (
        <div className="menu">
          <div className="menu-card">
            <div className="logo">MINI CITY</div>
            <div className="subtitle">OPEN WORLD 3D</div>
            <p>Explore, dirija e troque de carro na garagem.</p>
            <button className="play-button" onClick={() => setStarted(true)}>
              JOGAR
            </button>
            <div className="controls-info">
              <span>🕹️ Analógico</span>
              <span>🚗 Garagem</span>
              <span>👆 Câmera</span>
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
              "garage-marker-label" + (nearGarage && !garageOpen ? " visible" : "")
            }
          >
            GARAGEM — aperte E
          </div>

          <Joystick />
          <ActionButton />
          <div className="camera-help">Arraste para olhar</div>

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
