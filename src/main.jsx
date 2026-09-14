import React, {
  useEffect,
  useRef,
  useState,
  useMemo
} from "react";

import { createRoot } from "react-dom/client";

import {
  Canvas,
  useFrame
} from "@react-three/fiber";

import {
  Sky,
  useGLTF
} from "@react-three/drei";

import * as THREE from "three";

import "./style.css";


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const PLAYER_HEIGHT = 1.75;


/* =========================================================
   CONTROLES GLOBAIS
========================================================= */

window.__keys = {};
window.__joystick = { x: 0, y: 0 };
window.__camera = { yaw: 0, pitch: 0.28 };


/* =========================================================
   FUNÇÃO AUXILIAR
========================================================= */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


/* =========================================================
   CUBO / CILINDRO (usados no personagem)
========================================================= */

function Box({
  position,
  scale,
  color,
  rotation = [0, 0, 0],
  castShadow = true,
  receiveShadow = true,
  metalness = 0,
  roughness = 0.7
}) {
  return (
    <mesh
      position={position}
      scale={scale}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

function Cylinder({
  position,
  scale = [1, 1, 1],
  color,
  rotation = [0, 0, 0],
  metalness = 0,
  roughness = 0.7
}) {
  return (
    <mesh
      position={position}
      scale={scale}
      rotation={rotation}
      castShadow
    >
      <cylinderGeometry args={[1, 1, 1, 16]} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}


/* =========================================================
   MAPA .GLB
========================================================= */

function MapWorld({ mapBounds }) {
  const { scene } = useGLTF("/models/mapa.glb");

  const model = useMemo(() => {
    const clone = scene.clone(true);

    // Calcula tamanho original
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Ajusta escala do mapa (pode mudar depois se ficar grande/pequeno)
    // Queremos um mapa com cerca de 80~120 metros de lado
    const targetSize = 90;
    const currentSize = Math.max(size.x, size.z);
    const scale = currentSize > 0.01 ? targetSize / currentSize : 1;

    clone.scale.setScalar(scale);

    // Centraliza
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center.multiplyScalar(scale));

    // Coloca no chão (y = 0)
    const box2 = new THREE.Box3().setFromObject(clone);
    clone.position.y -= box2.min.y;

    // Atualiza limites do mapa
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

  return <primitive object={model} />;
}

useGLTF.preload("/models/mapa.glb");


/* =========================================================
   PERSONAGEM
========================================================= */

function Player({ playerRef, inCar, playerAnimation }) {
  const leftArm = useRef();
  const rightArm = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const body = useRef();

  useFrame((state) => {
    if (!leftArm.current || !rightArm.current || !body.current) return;

    const time = state.clock.elapsedTime;

    if (playerAnimation === "walk" && !inCar) {
      const swing = Math.sin(time * 10) * 0.7;
      leftArm.current.rotation.x = swing;
      rightArm.current.rotation.x = -swing;
      leftLeg.current.rotation.x = -swing * 0.9;
      rightLeg.current.rotation.x = swing * 0.9;
      body.current.position.y = Math.abs(Math.sin(time * 10)) * 0.05;
    } else {
      leftArm.current.rotation.x = 0.1;
      rightArm.current.rotation.x = 0.1;
      leftLeg.current.rotation.x = 0;
      rightLeg.current.rotation.x = 0;
      body.current.position.y = 0;
    }
  });

  return (
    <group ref={playerRef} position={[0, PLAYER_HEIGHT, 0]} visible={!inCar}>
      <group ref={body}>
        <group ref={leftLeg} position={[-0.2, -0.55, 0]}>
          <Cylinder position={[0, -0.45, 0]} scale={[0.16, 0.55, 0.16]} color="#1a1e28" />
          <Box position={[0, -0.95, 0.08]} scale={[0.32, 0.16, 0.55]} color="#111" />
        </group>

        <group ref={rightLeg} position={[0.2, -0.55, 0]}>
          <Cylinder position={[0, -0.45, 0]} scale={[0.16, 0.55, 0.16]} color="#1a1e28" />
          <Box position={[0, -0.95, 0.08]} scale={[0.32, 0.16, 0.55]} color="#111" />
        </group>

        <Box position={[0, -0.35, 0]} scale={[0.55, 0.25, 0.3]} color="#1a1e28" />

        <mesh position={[0, 0.15, 0]} castShadow>
          <capsuleGeometry args={[0.32, 0.55, 6, 12]} />
          <meshStandardMaterial color="#1e3a6e" roughness={0.65} />
        </mesh>

        <Box position={[0, 0.45, 0]} scale={[0.75, 0.22, 0.35]} color="#1a3360" />

        <mesh position={[0, 0.95, 0]} castShadow>
          <sphereGeometry args={[0.28, 16, 14]} />
          <meshStandardMaterial color="#c48a6a" roughness={0.7} />
        </mesh>

        <mesh position={[0, 1.12, -0.02]} scale={[1.05, 0.7, 1.05]} castShadow>
          <sphereGeometry args={[0.3, 14, 12]} />
          <meshStandardMaterial color="#1a120e" roughness={0.9} />
        </mesh>

        <group ref={leftArm} position={[-0.48, 0.35, 0]}>
          <Cylinder position={[0, -0.4, 0]} scale={[0.13, 0.45, 0.13]} color="#1e3a6e" />
          <mesh position={[0, -0.85, 0]}>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial color="#c48a6a" />
          </mesh>
        </group>

        <group ref={rightArm} position={[0.48, 0.35, 0]}>
          <Cylinder position={[0, -0.4, 0]} scale={[0.13, 0.45, 0.13]} color="#1e3a6e" />
          <mesh position={[0, -0.85, 0]}>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial color="#c48a6a" />
          </mesh>
        </group>
      </group>
    </group>
  );
}


/* =========================================================
   CARRO 350Z
========================================================= */

function Car({ carRef, playerRef, inCar, mapBounds }) {
  const { scene } = useGLTF("/models/350z.glb");
  const velocity = useRef(0);
  const steering = useRef(0);

  const model = useMemo(() => {
    const clone = scene.clone(true);

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetLength = 5.5;
    const currentLength = Math.max(size.x, size.z);
    const scale = currentLength > 0.01 ? targetLength / currentLength : 1.8;
    clone.scale.setScalar(scale);

    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.sub(center.multiplyScalar(scale));

    const box2 = new THREE.Box3().setFromObject(clone);
    clone.position.y -= box2.min.y;

    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return clone;
  }, [scene]);

  useFrame((_, delta) => {
    if (!carRef.current) return;

    if (inCar) {
      const keys = window.__keys || {};
      const joy = window.__joystick || { x: 0, y: 0 };

      const throttle = keys.w ? 1 : keys.s ? -1 : -joy.y;
      const turn = keys.a ? 1 : keys.d ? -1 : -joy.x;

      velocity.current += throttle * 20 * delta;
      velocity.current *= Math.pow(0.25, delta);
      velocity.current = clamp(velocity.current, -10, 28);

      steering.current = THREE.MathUtils.lerp(steering.current, turn, 8 * delta);

      carRef.current.rotation.y +=
        steering.current * delta * 1.7 * Math.min(1, Math.abs(velocity.current) / 4);

      const forward = new THREE.Vector3(0, 0, 1);
      forward.applyQuaternion(carRef.current.quaternion);

      carRef.current.position.addScaledVector(forward, velocity.current * delta);

      // Limites do mapa
      if (mapBounds.current) {
        const b = mapBounds.current;
        carRef.current.position.x = clamp(carRef.current.position.x, b.minX, b.maxX);
        carRef.current.position.z = clamp(carRef.current.position.z, b.minZ, b.maxZ);
      }

      if (playerRef.current) {
        playerRef.current.position.copy(carRef.current.position);
        playerRef.current.position.y = PLAYER_HEIGHT;
      }
    }
  });

  return (
    <group ref={carRef} position={[3, 0, 3]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload("/models/350z.glb");


/* =========================================================
   CONTROLE DO PERSONAGEM
========================================================= */

function PlayerController({ playerRef, inCar, mapBounds, setAnimation }) {
  const velocity = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!playerRef.current || inCar) {
      setAnimation("idle");
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

    const moving = direction.lengthSq() > 0.01;
    setAnimation(moving ? "walk" : "idle");

    const speed = 6.8;
    velocity.current.lerp(direction.multiplyScalar(speed), 1 - Math.pow(0.0008, delta));

    const next = playerRef.current.position.clone().addScaledVector(velocity.current, delta);

    // Limites do mapa
    if (mapBounds.current) {
      const b = mapBounds.current;
      next.x = clamp(next.x, b.minX, b.maxX);
      next.z = clamp(next.z, b.minZ, b.maxZ);
    }

    playerRef.current.position.copy(next);

    if (moving) {
      playerRef.current.rotation.y = Math.atan2(direction.x, direction.z);
    }
  });

  return null;
}


/* =========================================================
   CÂMERA
========================================================= */

function CameraController({ target, inCar }) {
  useFrame(({ camera }) => {
    if (!target.current) return;

    const targetPos = target.current.position;
    const distance = inCar ? 12 : 7.5;
    const yaw = window.__camera.yaw;
    const pitch = window.__camera.pitch;

    const offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance
    );

    const desired = targetPos.clone().add(offset);
    desired.y = Math.max(desired.y, 2.5);

    camera.position.lerp(desired, 0.1);
    camera.lookAt(targetPos.x, targetPos.y + 1.2, targetPos.z);
  });

  return null;
}


/* =========================================================
   GAME
========================================================= */

function Game({ setMessage }) {
  const playerRef = useRef();
  const carRef = useRef();
  const mapBounds = useRef(null);

  const [inCar, setInCar] = useState(false);
  const [animation, setAnimation] = useState("idle");

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

  // Entrar / Sair
  useEffect(() => {
    const tryToggleCar = () => {
      if (!carRef.current) return;

      if (inCar) {
        setInCar(false);

        if (playerRef.current) {
          const exitPos = new THREE.Vector3(-3.2, PLAYER_HEIGHT, 0);
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
      {/* MAPA NOVO */}
      <MapWorld mapBounds={mapBounds} />

      {/* CARRO */}
      <Car
        carRef={carRef}
        playerRef={playerRef}
        inCar={inCar}
        mapBounds={mapBounds}
      />

      {/* PERSONAGEM */}
      <Player
        playerRef={playerRef}
        inCar={inCar}
        playerAnimation={animation}
      />

      <PlayerController
        playerRef={playerRef}
        inCar={inCar}
        mapBounds={mapBounds}
        setAnimation={setAnimation}
      />

      <CameraController
        target={inCar ? carRef : playerRef}
        inCar={inCar}
      />

      <ambientLight intensity={1.1} />
      <directionalLight
        position={[30, 50, 20]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight args={["#87ceeb", "#4a5a4a", 0.5]} />
      <fog attach="fog" args={["#b0c4d0", 40, 120]} />
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
    window.__camera.pitch = clamp(window.__camera.pitch - dy * 0.0038, -0.15, 0.75);
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
            camera={{ position: [0, 8, 14], fov: 60, near: 0.1, far: 250 }}
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
