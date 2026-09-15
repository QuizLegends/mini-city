/**
 * main.jsx — Tokyo Night City
 * Mantém: carro 350Z, personagem, joystick, câmera, entrar/sair
 * Mapa: cidade procedural (src/city/)
 */
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
  useGLTF,
  useAnimations
} from "@react-three/drei";

import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import "./style.css";

import City, { ROAD_CONFIG } from "./city/City.jsx";


window.__keys = {};
window.__joystick = { x: 0, y: 0 };
window.__camera = { yaw: 0, pitch: 0.28 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


/* =========================================================
   PERSONAGEM
========================================================= */

const CHAR_PATH = "/models/personagem.glb";
// const CHAR_PATH = "/models/scifi_girl_v.01.glb";

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
        act.timeScale = 1.0;
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
   CARRO 350Z
========================================================= */

function Car({ carRef, playerRef, inCar, mapBounds, cityRef, obstacles }) {
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
    c.position.y += 0.12;

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

      velocity.current += throttle * 22 * delta;
      velocity.current *= Math.pow(0.22, delta);
      velocity.current = clamp(velocity.current, -12, 42);

      steering.current = THREE.MathUtils.lerp(steering.current, turn, 8 * delta);

      carRef.current.rotation.y +=
        steering.current *
        delta *
        1.85 *
        Math.min(1, Math.abs(velocity.current) / 5);

      const forward = new THREE.Vector3(0, 0, 1);
      forward.applyQuaternion(carRef.current.quaternion);

      const next = carRef.current.position
        .clone()
        .addScaledVector(forward, velocity.current * delta);

      if (mapBounds.current) {
        const b = mapBounds.current;
        next.x = clamp(next.x, b.minX, b.maxX);
        next.z = clamp(next.z, b.minZ, b.maxZ);
      }

      // Colisão AABB com prédios
      let blocked = false;
      if (obstacles.current) {
        const radius = 1.6;
        for (const box of obstacles.current) {
          if (
            next.x > box.minX - radius &&
            next.x < box.maxX + radius &&
            next.z > box.minZ - radius &&
            next.z < box.maxZ + radius
          ) {
            blocked = true;
            break;
          }
        }
      }

      if (!blocked) {
        carRef.current.position.x = next.x;
        carRef.current.position.z = next.z;
      } else {
        velocity.current *= 0.25;
      }

      // Chão / rampa (raycast)
      if (cityRef.current) {
        const downRay = new THREE.Raycaster();
        const origin = carRef.current.position.clone();
        origin.y += 6;
        downRay.set(origin, new THREE.Vector3(0, -1, 0));
        downRay.far = 30;
        const hits = downRay.intersectObject(cityRef.current, true);
        if (hits.length > 0) {
          carRef.current.position.y = hits[0].point.y + 0.12;
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
    <group ref={carRef} position={[0, 0.2, ROAD_CONFIG.straightStartZ - 5]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload("/models/350z.glb");


/* =========================================================
   CONTROLE A PÉ
========================================================= */

function PlayerController({
  playerRef,
  inCar,
  mapBounds,
  cityRef,
  obstacles,
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
    velocity.current.lerp(
      direction.multiplyScalar(speed),
      1 - Math.pow(0.0008, delta)
    );

    const next = playerRef.current.position
      .clone()
      .addScaledVector(velocity.current, delta);

    if (mapBounds.current) {
      const b = mapBounds.current;
      next.x = clamp(next.x, b.minX, b.maxX);
      next.z = clamp(next.z, b.minZ, b.maxZ);
    }

    let blocked = false;
    if (obstacles.current && moving) {
      const radius = 0.5;
      for (const box of obstacles.current) {
        if (
          next.x > box.minX - radius &&
          next.x < box.maxX + radius &&
          next.z > box.minZ - radius &&
          next.z < box.maxZ + radius
        ) {
          blocked = true;
          break;
        }
      }
    }

    if (!blocked) {
      playerRef.current.position.x = next.x;
      playerRef.current.position.z = next.z;
    }

    if (cityRef.current) {
      const downRay = new THREE.Raycaster();
      const origin = new THREE.Vector3(
        playerRef.current.position.x,
        playerRef.current.position.y + 8,
        playerRef.current.position.z
      );
      downRay.set(origin, new THREE.Vector3(0, -1, 0));
      downRay.far = 25;
      const hits = downRay.intersectObject(cityRef.current, true);
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

function CameraController({ target, inCar, cityRef }) {
  const { camera } = useThree();

  useFrame(() => {
    if (!target.current) return;

    const targetPos = target.current.position;
    const idealDistance = inCar ? 14 : 8.5;
    const yaw = window.__camera.yaw;
    const pitch = clamp(window.__camera.pitch, 0.1, 0.72);

    const offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch) * idealDistance,
      Math.sin(pitch) * idealDistance + (inCar ? 1.8 : 1.2),
      Math.cos(yaw) * Math.cos(pitch) * idealDistance
    );

    let desired = targetPos.clone().add(offset);
    desired.y = Math.max(desired.y, targetPos.y + 2.6);

    if (cityRef.current) {
      const ray = new THREE.Raycaster();
      const from = targetPos.clone();
      from.y += 1.3;
      const dir = desired.clone().sub(from).normalize();
      const dist = from.distanceTo(desired);
      ray.set(from, dir);
      ray.far = dist;
      const hits = ray.intersectObject(cityRef.current, true);
      if (hits.length > 0 && hits[0].distance < dist - 0.5) {
        desired = from
          .clone()
          .add(dir.multiplyScalar(Math.max(2.8, hits[0].distance - 0.7)));
        desired.y = Math.max(desired.y, targetPos.y + 2.2);
      }
    }

    camera.position.lerp(desired, 0.11);
    camera.lookAt(
      targetPos.x,
      targetPos.y + (inCar ? 1.2 : 1.1),
      targetPos.z
    );
  });

  return null;
}


/* =========================================================
   GAME
========================================================= */

function Game({ setMessage }) {
  const playerRef = useRef();
  const carRef = useRef();
  const cityRef = useRef();
  const mapBounds = useRef(null);
  const obstacles = useRef([]);

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
    setMessage(
      inCar
        ? "TÓQUIO  •  Reta → +Z  •  Espiral ~(55,-55)  •  E = sair"
        : "Aproxime-se do 350Z e toque E"
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
        const distance = playerRef.current.position.distanceTo(
          carRef.current.position
        );
        if (distance < 8) {
          setInCar(true);
          setMessage("Dirigindo em Tóquio");
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
      <City
        cityRef={cityRef}
        obstacles={obstacles}
        mapBounds={mapBounds}
      />

      <Car
        carRef={carRef}
        playerRef={playerRef}
        inCar={inCar}
        mapBounds={mapBounds}
        cityRef={cityRef}
        obstacles={obstacles}
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
        cityRef={cityRef}
        obstacles={obstacles}
        setIsMoving={setIsMoving}
      />

      <CameraController
        target={inCar ? carRef : playerRef}
        inCar={inCar}
        cityRef={cityRef}
      />
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
      e.target.closest(".action-button")
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
      0.1,
      0.72
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

  return (
    <div className="app">
      {!started && (
        <div className="menu">
          <div className="menu-card">
            <div className="logo">TOKYO NIGHT</div>
            <div className="subtitle">STREET RACING</div>
            <p>
              Cidade noturna, grande reta e prédio em espiral. Drift e explore.
            </p>
            <button className="play-button" onClick={() => setStarted(true)}>
              JOGAR
            </button>
            <div className="controls-info">
              <span>🕹️ Dirigir</span>
              <span>👆 Câmera</span>
              <span>🌀 Espiral</span>
            </div>
          </div>
        </div>
      )}

      {started && (
        <>
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [0, 12, 30], fov: 55, near: 0.1, far: 400 }}
            gl={{ antialias: true }}
          >
            <color attach="background" args={["#06080e"]} />
            <Game setMessage={setMessage} />
          </Canvas>

          <CameraTouch />
          <div className="hud">
            <div className="game-title">TOKYO NIGHT</div>
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
