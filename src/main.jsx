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
   CAMINHO DO PERSONAGEM
   Ajuste se o nome do arquivo for outro
========================================================= */

const CHAR_PATH = "/models/personagem.glb";
// exemplos:
// const CHAR_PATH = "/models/scifi_girl_v.01.glb";


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
        minX: finalBox.min.x + 3,
        maxX: finalBox.max.x - 3,
        minZ: finalBox.min.z + 3,
        maxZ: finalBox.max.z - 3
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
   PERSONAGEM (escala + animação corrigidas)
========================================================= */

function Player({ playerRef, inCar, isMoving }) {
  const { scene, animations } = useGLTF(CHAR_PATH);

  // Clone do esqueleto (sem escalar aqui)
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

  // Mede o tamanho ORIGINAL e define escala no group
  const charScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = size.y || 1;

    // Se veio em cm (Mixamo ~160–180), escala ~0.01
    // Se já estiver em metros (~1.6–2), escala ~1
    let s = 1.65 / h;
    // limites de segurança
    if (s > 5) s = 0.01;
    if (s < 0.001) s = 0.01;
    console.log("Altura original do personagem:", h.toFixed(2), "→ escala:", s.toFixed(4));
    return s;
  }, [scene]);

  const { actions, names } = useAnimations(animations, playerRef);
  const current = useRef(null);

  // Lista animações uma vez
  useEffect(() => {
    console.log("Animações do GLB:", names);
  }, [names]);

  // Controla animação pelo analógico
  useEffect(() => {
    if (!actions || names.length === 0) return;

    const walkName =
      names.find((n) => /walk|run|running|walking|move/i.test(n)) || names[0];

    const idleName = names.find(
      (n) => /idle|stand|wait|breath/i.test(n) && !/walk|run/i.test(n)
    );

    // Para tudo primeiro
    Object.values(actions).forEach((a) => {
      if (a && a.isRunning && a.isRunning()) a.fadeOut(0.1);
    });

    if (isMoving) {
      const act = actions[walkName];
      if (act) {
        act.reset().fadeIn(0.12).play();
        act.setLoop(THREE.LoopRepeat, Infinity);
        act.timeScale = 1.0;
        current.current = walkName;
      }
    } else {
      if (idleName && actions[idleName]) {
        actions[idleName].reset().fadeIn(0.12).play();
        actions[idleName].setLoop(THREE.LoopRepeat, Infinity);
        current.current = idleName;
      } else if (walkName && actions[walkName]) {
        // Sem idle: congela
        actions[walkName].stop();
        actions[walkName].reset();
        current.current = null;
      }
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
   CARRO
========================================================= */

function Car({ carRef, playerRef, inCar, mapBounds, mapRef }) {
  const { scene } = useGLTF("/models/350z.glb");
  const velocity = useRef(0);
  const steering = useRef(0);
  const wheels = useRef([]);

  const model = useMemo(() => {
    const c = scene.clone(true);

    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetLength = 5.2;
    const currentLength = Math.max(size.x, size.z);
    const scale = currentLength > 0.01 ? targetLength / currentLength : 1.8;
    c.scale.setScalar(scale);

    const center = new THREE.Vector3();
    box.getCenter(center);
    c.position.sub(center.multiplyScalar(scale));

    const box2 = new THREE.Box3().setFromObject(c);
    c.position.y -= box2.min.y;
    c.position.y += 0.18;

    const found = [];
    c.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const name = (child.name || "").toLowerCase();
        if (
          name.includes("wheel") ||
          name.includes("tire") ||
          name.includes("tyre") ||
          name.includes("rim")
        ) {
          found.push(child);
        }
      }
    });
    wheels.current = found;
    return c;
  }, [scene]);

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

      const next = carRef.current.position.clone().addScaledVector(forward, velocity.current * delta);

      if (mapBounds.current) {
        const b = mapBounds.current;
        next.x = clamp(next.x, b.minX, b.maxX);
        next.z = clamp(next.z, b.minZ, b.maxZ);
      }

      if (mapRef.current && Math.abs(velocity.current) > 0.3) {
        const ray = new THREE.Raycaster();
        const dir = forward.clone().normalize();
        if (velocity.current < 0) dir.negate();
        const origin = carRef.current.position.clone();
        origin.y += 0.6;
        ray.set(origin, dir);
        ray.far = 2.5;
        const hits = ray.intersectObject(mapRef.current, true);
        if (hits.length === 0 || hits[0].distance > 1.8) {
          carRef.current.position.copy(next);
        } else {
          velocity.current *= 0.3;
        }
      } else {
        carRef.current.position.copy(next);
      }

      if (mapRef.current) {
        const downRay = new THREE.Raycaster();
        const origin = carRef.current.position.clone();
        origin.y += 3;
        downRay.set(origin, new THREE.Vector3(0, -1, 0));
        downRay.far = 10;
        const hits = downRay.intersectObject(mapRef.current, true);
        if (hits.length > 0) {
          carRef.current.position.y = hits[0].point.y + 0.15;
        }
      }

      if (playerRef.current) {
        playerRef.current.position.copy(carRef.current.position);
      }
    }

    const spin = velocity.current * delta * 2.2;
    wheels.current.forEach((w) => {
      if (w) w.rotation.x += spin;
    });
  });

  return (
    <group ref={carRef} position={[4, 0.2, 4]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload("/models/350z.glb");


/* =========================================================
   CONTROLE
========================================================= */

function PlayerController({
  playerRef,
  inCar,
  mapBounds,
  mapRef,
  setIsMoving
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
    velocity.current.lerp(direction.multiplyScalar(speed), 1 - Math.pow(0.0008, delta));

    const next = playerRef.current.position.clone().addScaledVector(velocity.current, delta);

    if (mapBounds.current) {
      const b = mapBounds.current;
      next.x = clamp(next.x, b.minX, b.maxX);
      next.z = clamp(next.z, b.minZ, b.maxZ);
    }

    if (mapRef.current && moving) {
      const ray = new THREE.Raycaster();
      const dir = direction.clone().normalize();
      const origin = playerRef.current.position.clone();
      origin.y += 0.8;
      ray.set(origin, dir);
      ray.far = 1.0;
      const hits = ray.intersectObject(mapRef.current, true);
      if (hits.length === 0 || hits[0].distance > 0.55) {
        playerRef.current.position.x = next.x;
        playerRef.current.position.z = next.z;
      }
    } else if (moving) {
      playerRef.current.position.x = next.x;
      playerRef.current.position.z = next.z;
    }

    // Chão
    if (mapRef.current) {
      const downRay = new THREE.Raycaster();
      const origin = new THREE.Vector3(
        playerRef.current.position.x,
        playerRef.current.position.y + 8,
        playerRef.current.position.z
      );
      downRay.set(origin, new THREE.Vector3(0, -1, 0));
      downRay.far = 25;
      const hits = downRay.intersectObject(mapRef.current, true);
      if (hits.length > 0) {
        playerRef.current.position.y = hits[0].point.y;
      }
    }

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
        desired = from.clone().add(dir.multiplyScalar(Math.max(2.5, hits[0].distance - 0.6)));
        desired.y = Math.max(desired.y, targetPos.y + 2.0);
      }
    }

    camera.position.lerp(desired, 0.12);
    camera.lookAt(targetPos.x, targetPos.y + (inCar ? 1.3 : 1.1), targetPos.z);
  });

  return null;
}


/* =========================================================
   GAME
========================================================= */

function Game({ setMessage }) {
  const playerRef = useRef();
  const carRef = useRef();
  const mapRef = useRef();
  const mapBounds = useRef(null);

  const [inCar, setInCar] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    const down = (e) => { window.__keys[e.key.toLowerCase()] = true; };
    const up = (e) => { window.__keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    setMessage(
      inCar
        ? "DIRIGINDO  •  Toque E para sair"
        : "Aproxime-se do carro e toque E para entrar"
    );
  }, [inCar, setMessage]);

  useEffect(() => {
    const tryToggleCar = () => {
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
      } else {
        if (!playerRef.current) return;
        const distance = playerRef.current.position.distanceTo(carRef.current.position);
        if (distance < 7) {
          setInCar(true);
          setMessage("Você entrou no carro");
        }
      }
    };

    window.__toggleCar = tryToggleCar;

    const onKeyDown = (e) => {
      if (e.key.toLowerCase() === "e" && !window.__ePressed) {
        window.__ePressed = true;
        tryToggleCar();
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

  return (
    <>
      <MapWorld mapRef={mapRef} mapBounds={mapBounds} />

      <Car
        carRef={carRef}
        playerRef={playerRef}
        inCar={inCar}
        mapBounds={mapBounds}
        mapRef={mapRef}
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
   UI
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
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
  }

  return (
    <div
      className="joystick"
      ref={baseRef}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => { if (active.current) end(); }}
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
    if (e.target.closest(".joystick") || e.target.closest(".action-button")) return;
    active.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  }

  function move(e) {
    if (!active.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    window.__camera.yaw -= dx * 0.0055;
    window.__camera.pitch = clamp(window.__camera.pitch - dy * 0.0038, 0.12, 0.75);
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

  return (
    <div className="app">
      {!started && (
        <div className="menu">
          <div className="menu-card">
            <div className="logo">MINI CITY</div>
            <div className="subtitle">OPEN WORLD 3D</div>
            <p>Explore o mapa, ande e dirija o 350Z.</p>
            <button className="play-button" onClick={() => setStarted(true)}>
              JOGAR
            </button>
            <div className="controls-info">
              <span>🕹️ Analógico</span>
              <span>👆 Câmera livre</span>
              <span>🚗 Dirigir</span>
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
            <Game setMessage={setMessage} />
          </Canvas>

          <CameraTouch />
          <div className="hud">
            <div className="game-title">MINI CITY</div>
            <div className="message">{message}</div>
          </div>
          <Joystick />
          <ActionButton />
          <div className="camera-help">Arraste para olhar</div>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
