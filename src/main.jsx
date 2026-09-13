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

const CITY_LIMIT = 38;
const PLAYER_HEIGHT = 1.75;
const CAR_HEIGHT = 0.0; // o modelo real já tem a altura correta


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
   CUBO
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


/* =========================================================
   CILINDRO
========================================================= */

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
   CIDADE
========================================================= */

function City({ obstacles }) {
  const buildings = [
    [-29, 6, -28, 9, 12, 9],
    [-16, 9, -30, 8, 18, 8],
    [-2, 5, -30, 10, 10, 10],
    [14, 7, -30, 9, 14, 9],
    [29, 11, -27, 9, 22, 9],
    [-30, 8, -12, 9, 16, 9],
    [30, 6, -10, 11, 12, 11],
    [-30, 12, 8, 8, 24, 8],
    [31, 9, 10, 10, 18, 10],
    [-27, 6, 29, 11, 12, 9],
    [-12, 10, 29, 9, 20, 9],
    [4, 6, 30, 11, 12, 11],
    [20, 8, 29, 10, 16, 10],
    [33, 13, 28, 8, 26, 8],
    [22, 5, 12, 11, 10, 11],
    [-8, 7, 12, 8, 14, 8],
    [8, 4, -12, 9, 8, 9]
  ];

  useEffect(() => {
    obstacles.current = buildings.map(b => ({
      minX: b[0] - b[3] / 2,
      maxX: b[0] + b[3] / 2,
      minZ: b[2] - b[5] / 2,
      maxZ: b[2] + b[5] / 2
    }));
  }, []);

  const buildingColors = [
    "#6e747a", "#8a6f5a", "#4f5f68", "#9a9180",
    "#5c5a62", "#7a6b5c", "#5a6a72", "#8c8374"
  ];

  return (
    <>
      {/* Chão */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#4a4e52" roughness={0.95} />
      </mesh>

      <Box position={[0, 0.01, 0]} scale={[90, 0.04, 90]} color="#6b6760" castShadow={false} />

      {/* Estradas */}
      <Box position={[0, 0.04, 0]} scale={[14, 0.06, 90]} color="#1e2124" castShadow={false} />
      <Box position={[0, 0.04, 0]} scale={[90, 0.06, 14]} color="#1e2124" castShadow={false} />
      <Box position={[-26, 0.05, 0]} scale={[7, 0.05, 90]} color="#2a2d31" castShadow={false} />
      <Box position={[26, 0.05, 0]} scale={[7, 0.05, 90]} color="#2a2d31" castShadow={false} />

      {/* Faixas */}
      {Array.from({ length: 13 }).map((_, i) => (
        <Box
          key={"stripe-z-" + i}
          position={[0, 0.08, -42 + i * 7]}
          scale={[0.25, 0.02, 3.2]}
          color="#e8d45a"
          castShadow={false}
        />
      ))}
      {Array.from({ length: 13 }).map((_, i) => (
        <Box
          key={"stripe-x-" + i}
          position={[-42 + i * 7, 0.08, 0]}
          scale={[3.2, 0.02, 0.25]}
          color="#e8d45a"
          castShadow={false}
        />
      ))}

      {/* Prédios */}
      {buildings.map((b, i) => (
        <group key={"b-" + i}>
          <Box
            position={[b[0], b[1] / 2, b[2]]}
            scale={[b[3], b[4], b[5]]}
            color={buildingColors[i % buildingColors.length]}
            roughness={0.85}
          />
          <Box
            position={[b[0], 0.4, b[2]]}
            scale={[b[3] + 0.3, 0.8, b[5] + 0.3]}
            color="#3a3e42"
            castShadow={false}
          />
          {Array.from({ length: Math.min(5, Math.floor(b[4] / 2.4)) }).map((_, row) => (
            <group key={"win-" + row}>
              <Box
                position={[b[0], 1.6 + row * 2.5, b[2] - b[5] / 2 - 0.04]}
                scale={[Math.min(b[3] * 0.7, 5), 0.7, 0.06]}
                color="#1a2a35"
                castShadow={false}
              />
            </group>
          ))}
        </group>
      ))}

      {/* Estádio */}
      <group position={[0, 0.05, 24]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[10, 15.5, 64]} />
          <meshStandardMaterial color="#4a4f55" roughness={0.9} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[9.5, 64]} />
          <meshStandardMaterial color="#1e6b35" roughness={0.85} />
        </mesh>
        <mesh position={[0, 2.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[12.8, 2.4, 10, 64]} />
          <meshStandardMaterial color="#c8c8c8" roughness={0.7} />
        </mesh>
      </group>

      {/* Árvores */}
      {[
        [-36, -34], [-22, -22], [22, -22], [36, -34],
        [-36, 6], [36, 6], [-36, 35], [36, 35],
        [-18, 18], [18, 18], [-8, -18], [10, -8]
      ].map(([x, z], i) => (
        <group key={"tree-" + i} position={[x, 0, z]}>
          <Cylinder position={[0, 1.5, 0]} scale={[0.32, 1.5, 0.32]} color="#4a3220" roughness={0.9} />
          <mesh position={[0, 3.4, 0]} castShadow>
            <sphereGeometry args={[1.9, 14, 12]} />
            <meshStandardMaterial color="#1e6b32" roughness={0.8} />
          </mesh>
          <mesh position={[0.5, 3.0, 0.4]} castShadow>
            <sphereGeometry args={[1.2, 12, 10]} />
            <meshStandardMaterial color="#247a3a" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </>
  );
}


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

    if (playerAnimation === "walk") {
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

  if (inCar) return null;

  return (
    <group ref={playerRef} position={[0, PLAYER_HEIGHT, 0]}>
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
   CARRO REAL (350Z.glb)
========================================================= */

function Car({ carRef, playerRef, inCar }) {
  const { scene } = useGLTF("/models/350z.glb");
  const velocity = useRef(0);
  const steering = useRef(0);

  // Clona o modelo para evitar problemas de reutilização
  const model = useMemo(() => {
    const clone = scene.clone(true);
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

      // Frente = acelerar (corrigido)
      const throttle = keys.w ? 1 : keys.s ? -1 : -joy.y;
      const turn = keys.a ? 1 : keys.d ? -1 : -joy.x;

      velocity.current += throttle * 18 * delta;
      velocity.current *= Math.pow(0.28, delta);
      velocity.current = clamp(velocity.current, -9, 26);

      steering.current = THREE.MathUtils.lerp(steering.current, turn, 7 * delta);

      // Rotação do carro
      carRef.current.rotation.y +=
        steering.current * delta * 1.6 * Math.min(1, Math.abs(velocity.current) / 4);

      // Movimento para frente (modelo geralmente aponta para -Z ou +Z)
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(carRef.current.quaternion);

      carRef.current.position.addScaledVector(forward, velocity.current * delta);

      // Limites da cidade
      carRef.current.position.x = clamp(carRef.current.position.x, -CITY_LIMIT, CITY_LIMIT);
      carRef.current.position.z = clamp(carRef.current.position.z, -CITY_LIMIT, CITY_LIMIT);

      // Mantém o player "dentro" do carro (invisível)
      if (playerRef.current) {
        playerRef.current.position.copy(carRef.current.position);
        playerRef.current.position.y = PLAYER_HEIGHT;
      }
    }
  });

  return (
    <group
      ref={carRef}
      position={[0, CAR_HEIGHT, -8]}
      // Ajuste de escala e rotação se o modelo estiver torto ou grande demais
      scale={[1.1, 1.1, 1.1]}
      rotation={[0, Math.PI, 0]} // gira 180° se o carro estiver de costas
    >
      <primitive object={model} />
    </group>
  );
}

// Preload do modelo
useGLTF.preload("/models/350z.glb");


/* =========================================================
   COLISÃO
========================================================= */

function collides(position, obstacles, radius = 0.75) {
  if (
    position.x < -CITY_LIMIT ||
    position.x > CITY_LIMIT ||
    position.z < -CITY_LIMIT ||
    position.z > CITY_LIMIT
  ) return true;

  for (const box of obstacles.current) {
    if (
      position.x > box.minX - radius &&
      position.x < box.maxX + radius &&
      position.z > box.minZ - radius &&
      position.z < box.maxZ + radius
    ) return true;
  }
  return false;
}


/* =========================================================
   CONTROLE DO PERSONAGEM
========================================================= */

function PlayerController({ playerRef, carRef, inCar, obstacles, setAnimation, setInCar }) {
  const velocity = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!playerRef.current) return;

    // Quando está no carro, não controla o personagem
    if (inCar) {
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

    if (!collides(next, obstacles, 0.6)) {
      playerRef.current.position.copy(next);
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

function CameraController({ target, inCar }) {
  useFrame(({ camera }) => {
    if (!target.current) return;

    const targetPos = target.current.position;
    const distance = inCar ? 11 : 7.5;
    const yaw = window.__camera.yaw;
    const pitch = window.__camera.pitch;

    const offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance
    );

    const desired = targetPos.clone().add(offset);
    desired.y = Math.max(desired.y, 2.4);

    camera.position.lerp(desired, 0.1);
    camera.lookAt(targetPos.x, targetPos.y + (inCar ? 1.0 : 1.2), targetPos.z);
  });

  return null;
}


/* =========================================================
   GAME
========================================================= */

function Game({ setMessage }) {
  const playerRef = useRef();
  const carRef = useRef();
  const obstacles = useRef([]);
  const [inCar, setInCar] = useState(false);
  const [animation, setAnimation] = useState("idle");

  // Teclado
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

  // Mensagem
  useEffect(() => {
    setMessage(
      inCar
        ? "DIRIGINDO  •  Toque E ou o botão para sair"
        : "Aproxime-se do 350Z e toque E para entrar"
    );
  }, [inCar, setMessage]);

  // ===== SISTEMA DE ENTRAR / SAIR DO CARRO (CORRIGIDO) =====
  useEffect(() => {
    const tryToggleCar = () => {
      if (!playerRef.current || !carRef.current) return;

      if (inCar) {
        // SAIR do carro
        setInCar(false);

        const exitPos = new THREE.Vector3(-2.8, PLAYER_HEIGHT, 0);
        exitPos.applyQuaternion(carRef.current.quaternion);
        exitPos.add(carRef.current.position);
        playerRef.current.position.copy(exitPos);

        setMessage("Você saiu do 350Z");
      } else {
        // ENTRAR no carro
        const distance = playerRef.current.position.distanceTo(carRef.current.position);
        if (distance < 5) {
          setInCar(true);
          setMessage("Você entrou no 350Z");
        }
      }
    };

    // Tecla E
    const onKeyDown = (e) => {
      if (e.key.toLowerCase() === "e" && !window.__ePressed) {
        window.__ePressed = true;
        tryToggleCar();
      }
    };

    const onKeyUp = (e) => {
      if (e.key.toLowerCase() === "e") {
        window.__ePressed = false;
      }
    };

    // Botão da tela também chama a mesma função
    window.__toggleCar = tryToggleCar;

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
      <City obstacles={obstacles} />

      <Car
        carRef={carRef}
        playerRef={playerRef}
        inCar={inCar}
      />

      <Player
        playerRef={playerRef}
        inCar={inCar}
        playerAnimation={animation}
      />

      <PlayerController
        playerRef={playerRef}
        carRef={carRef}
        inCar={inCar}
        obstacles={obstacles}
        setAnimation={setAnimation}
        setInCar={setInCar}
      />

      <CameraController
        target={inCar ? carRef : playerRef}
        inCar={inCar}
      />

      <ambientLight intensity={0.9} />
      <directionalLight
        position={[25, 40, 18]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={90}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <hemisphereLight args={["#87ceeb", "#3a4a3a", 0.4]} />
      <fog attach="fog" args={["#a8c0d0", 40, 100]} />
    </>
  );
}


/* =========================================================
   ANALÓGICO
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
      onPointerLeave={() => { if (active.current) end(); }}
    >
      <div className="joystick-knob" ref={knobRef} />
    </div>
  );
}


/* =========================================================
   BOTÃO E (agora funciona para entrar E sair)
========================================================= */

function ActionButton() {
  return (
    <button
      className="action-button"
      onPointerDown={() => {
        if (window.__toggleCar) {
          window.__toggleCar();
        }
      }}
    >
      E
    </button>
  );
}


/* =========================================================
   CÂMERA TOUCH
========================================================= */

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
    window.__camera.pitch = clamp(
      window.__camera.pitch - dy * 0.0038,
      -0.15,
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

  return (
    <div className="app">
      {!started && (
        <div className="menu">
          <div className="menu-card">
            <div className="logo">MINI CITY</div>
            <div className="subtitle">OPEN WORLD 3D</div>
            <p>
              Explore a small city,
              walk around and drive
              a tuned green sports car.
            </p>
            <button
              className="play-button"
              onClick={() => setStarted(true)}
            >
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
            camera={{ position: [0, 6, 12], fov: 60, near: 0.1, far: 200 }}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          >
            <Sky sunPosition={[80, 30, 40]} turbidity={6} rayleigh={1.2} />
            <Game setMessage={setMessage} />
          </Canvas>

          <CameraTouch />

          <div className="hud">
            <div className="game-title">MINI CITY</div>
            <div className="message">{message}</div>
          </div>

          <Joystick />
          <ActionButton />

          <div className="camera-help">
            Arraste para olhar
          </div>
        </>
      )}
    </div>
  );
}


/* =========================================================
   START
========================================================= */

createRoot(document.getElementById("root")).render(<App />);
