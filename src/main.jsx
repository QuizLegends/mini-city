import React, {
  useEffect,
  useRef,
  useState
} from "react";

import { createRoot } from "react-dom/client";

import {
  Canvas,
  useFrame
} from "@react-three/fiber";

import {
  Sky
} from "@react-three/drei";

import * as THREE from "three";

import "./style.css";


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const CITY_LIMIT = 37;

const PLAYER_HEIGHT = 1.8;

const CAR_HEIGHT = 0.65;


/* =========================================================
   CONTROLES GLOBAIS
========================================================= */

window.__keys = {};

window.__joystick = {
  x: 0,
  y: 0
};

window.__camera = {
  yaw: 0,
  pitch: 0.25
};


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
  castShadow = true
}) {

  return (

    <mesh
      position={position}
      scale={scale}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow
    >

      <boxGeometry
        args={[1, 1, 1]}
      />

      <meshStandardMaterial
        color={color}
        roughness={0.7}
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
  rotation = [0, 0, 0]
}) {

  return (

    <mesh
      position={position}
      scale={scale}
      rotation={rotation}
      castShadow
    >

      <cylinderGeometry
        args={[1, 1, 16]}
      />

      <meshStandardMaterial
        color={color}
        roughness={0.7}
      />

    </mesh>

  );
}


/* =========================================================
   CIDADE
========================================================= */

function City({
  obstacles
}) {

  const buildings = [

    [-29, 5, -28, 8, 10, 8],
    [-16, 8, -30, 7, 16, 7],
    [-2, 4, -30, 9, 8, 9],
    [14, 6, -30, 8, 12, 8],
    [29, 10, -27, 8, 20, 8],

    [-30, 7, -12, 8, 14, 8],
    [30, 5, -10, 10, 10, 10],

    [-30, 11, 8, 7, 22, 7],
    [31, 8, 10, 9, 16, 9],

    [-27, 5, 29, 10, 10, 8],
    [-12, 9, 29, 8, 18, 8],
    [4, 5, 30, 10, 10, 10],
    [20, 7, 29, 9, 14, 9],
    [33, 12, 28, 7, 24, 7],

    [22, 4, 12, 10, 8, 10]
  ];


  useEffect(() => {

    obstacles.current =
      buildings.map(b => ({

        minX:
          b[0] - b[3] / 2,

        maxX:
          b[0] + b[3] / 2,

        minZ:
          b[2] - b[5] / 2,

        maxZ:
          b[2] + b[5] / 2

      }));

  }, []);


  return (

    <>

      {/* =================================================
          TERRENO
      ================================================= */}

      <Box
        position={[
          0,
          -0.2,
          0
        ]}
        scale={[
          80,
          0.4,
          80
        ]}
        color="#555b60"
        castShadow={false}
      />


      <Box
        position={[
          0,
          0.02,
          0
        ]}
        scale={[
          80,
          0.08,
          80
        ]}
        color="#7a766f"
        castShadow={false}
      />


      {/* =================================================
          ESTRADA PRINCIPAL
      ================================================= */}

      <Box
        position={[
          0,
          0.08,
          0
        ]}
        scale={[
          12,
          0.05,
          80
        ]}
        color="#24272b"
        castShadow={false}
      />


      <Box
        position={[
          0,
          0.09,
          0
        ]}
        scale={[
          80,
          0.05,
          12
        ]}
        color="#24272b"
        castShadow={false}
      />


      <Box
        position={[
          -25,
          0.1,
          0
        ]}
        scale={[
          6,
          0.05,
          80
        ]}
        color="#303338"
        castShadow={false}
      />


      <Box
        position={[
          25,
          0.1,
          0
        ]}
        scale={[
          6,
          0.05,
          80
        ]}
        color="#303338"
        castShadow={false}
      />


      {/* =================================================
          FAIXAS
      ================================================= */}

      {Array.from({
        length: 11
      }).map((_, i) => (

        <Box
          key={"road-" + i}
          position={[
            0,
            0.13,
            -35 + i * 7
          ]}
          scale={[
            0.3,
            0.02,
            3
          ]}
          color="#e6d86a"
          castShadow={false}
        />

      ))}


      {/* =================================================
          PRÉDIOS
      ================================================= */}

      {buildings.map((b, i) => (

        <group
          key={"building-" + i}
        >

          <Box
            position={[
              b[0],
              b[1] / 2,
              b[2]
            ]}
            scale={[
              b[3],
              b[4],
              b[5]
            ]}
            color={[
              "#858b91",
              "#9b765f",
              "#596b75",
              "#aaa18f",
              "#68666e"
            ][i % 5]}
          />


          {/* Janelas */}

          {Array.from({
            length: Math.min(
              4,
              Math.floor(b[4] / 3)
            )
          }).map((_, row) => (

            <group
              key={row}
            >

              <Box
                position={[
                  b[0],
                  1.8 + row * 2.7,
                  b[2] -
                    b[5] / 2 -
                    0.03
                ]}
                scale={[
                  Math.min(
                    b[3] * 0.65,
                    4
                  ),
                  0.65,
                  0.05
                ]}
                color="#263a48"
              />

            </group>

          ))}

        </group>

      ))}


      {/* =================================================
          ESTÁDIO
      ================================================= */}

      <group
        position={[
          0,
          0.1,
          22
        ]}
      >

        <mesh
          rotation={[
            -Math.PI / 2,
            0,
            0
          ]}
          receiveShadow
        >

          <ringGeometry
            args={[
              9,
              14,
              48
            ]}
          />

          <meshStandardMaterial
            color="#575c62"
          />

        </mesh>


        <mesh
          rotation={[
            -Math.PI / 2,
            0,
            0
          ]}
          position={[
            0,
            0.03,
            0
          ]}
        >

          <circleGeometry
            args={[
              8.5,
              48
            ]}
          />

          <meshStandardMaterial
            color="#236b3a"
          />

        </mesh>


        <mesh
          position={[
            0,
            2,
            0
          ]}
          rotation={[
            Math.PI / 2,
            0,
            0
          ]}
        >

          <torusGeometry
            args={[
              11.5,
              2,
              8,
              48
            ]}
          />

          <meshStandardMaterial
            color="#bdbdbd"
          />

        </mesh>

      </group>


      {/* =================================================
          ÁRVORES
      ================================================= */}

      {[
        [-35, -32],
        [-20, -20],
        [20, -20],
        [35, -32],
        [-35, 5],
        [35, 5],
        [-35, 34],
        [35, 34]
      ].map(([x, z], i) => (

        <group
          key={"tree-" + i}
          position={[
            x,
            0,
            z
          ]}
        >

          <Cylinder
            position={[
              0,
              1.4,
              0
            ]}
            scale={[
              0.35,
              1.4,
              0.35
            ]}
            color="#553a24"
          />


          <mesh
            position={[
              0,
              3.2,
              0
            ]}
            castShadow
          >

            <sphereGeometry
              args={[
                1.7,
                12,
                10
              ]}
            />

            <meshStandardMaterial
              color="#246d38"
            />

          </mesh>

        </group>

      ))}

    </>

  );
}


/* =========================================================
   PERSONAGEM HUMANO
========================================================= */

function Player({
  playerRef,
  inCar,
  playerAnimation
}) {

  const leftArm =
    useRef();

  const rightArm =
    useRef();

  const leftLeg =
    useRef();

  const rightLeg =
    useRef();

  const body =
    useRef();


  useFrame((state) => {

    const time =
      state.clock.elapsedTime;


    if (
      !leftArm.current ||
      !rightArm.current
    ) {
      return;
    }


    if (
      playerAnimation === "walk"
    ) {

      const swing =
        Math.sin(time * 9) *
        0.65;


      leftArm.current.rotation.x =
        swing;

      rightArm.current.rotation.x =
        -swing;


      leftLeg.current.rotation.x =
        -swing;

      rightLeg.current.rotation.x =
        swing;


      body.current.position.y =
        Math.abs(
          Math.sin(time * 9)
        ) * 0.04;

    }

    else {

      leftArm.current.rotation.x =
        0;

      rightArm.current.rotation.x =
        0;

      leftLeg.current.rotation.x =
        0;

      rightLeg.current.rotation.x =
        0;

      body.current.position.y =
        0;

    }

  });


  return (

    <group
      ref={playerRef}
      position={[
        0,
        PLAYER_HEIGHT,
        0
      ]}
    >

      <group
        ref={body}
      >

        {/* =================================================
            PERNAS
        ================================================= */}

        <group
          ref={leftLeg}
          position={[
            -0.22,
            -0.7,
            0
          ]}
        >

          <Cylinder
            position={[
              0,
              -0.5,
              0
            ]}
            scale={[
              0.18,
              0.55,
              0.18
            ]}
            color="#151922"
          />


          <Box
            position={[
              0,
              -1.05,
              0.12
            ]}
            scale={[
              0.35,
              0.18,
              0.65
            ]}
            color="#111318"
          />

        </group>


        <group
          ref={rightLeg}
          position={[
            0.22,
            -0.7,
            0
          ]}
        >

          <Cylinder
            position={[
              0,
              -0.5,
              0
            ]}
            scale={[
              0.18,
              0.55,
              0.18
            ]}
            color="#151922"
          />


          <Box
            position={[
              0,
              -1.05,
              0.12
            ]}
            scale={[
              0.35,
              0.18,
              0.65
            ]}
            color="#111318"
          />

        </group>


        {/* =================================================
            TRONCO
        ================================================= */}

        <mesh
          position={[
            0,
            0,
            0
          ]}
          castShadow
        >

          <capsuleGeometry
            args={[
              0.42,
              0.7,
              8,
              16
            ]}
          />

          <meshStandardMaterial
            color="#202f58"
            roughness={0.6}
          />

        </mesh>


        {/* =================================================
            CABEÇA
        ================================================= */}

        <mesh
          position={[
            0,
            0.85,
            0
          ]}
          castShadow
        >

          <sphereGeometry
            args={[
              0.35,
              16,
              12
            ]}
          />

          <meshStandardMaterial
            color="#c98968"
          />

        </mesh>


        {/* Cabelo */}

        <mesh
          position={[
            0,
            1.08,
            0
          ]}
          scale={[
            1,
            0.65,
            1
          ]}
          castShadow
        >

          <sphereGeometry
            args={[
              0.37,
              16,
              10
            ]}
          />

          <meshStandardMaterial
            color="#17120f"
          />

        </mesh>


        {/* =================================================
            BRAÇOS
        ================================================= */}

        <group
          ref={leftArm}
          position={[
            -0.5,
            0.3,
            0
          ]}
        >

          <Cylinder
            position={[
              0,
              -0.45,
              0
            ]}
            scale={[
              0.15,
              0.5,
              0.15
            ]}
            color="#202f58"
          />


          <mesh
            position={[
              0,
              -0.95,
              0
            ]}
          >

            <sphereGeometry
              args={[
                0.16,
                12,
                8
              ]}
            />

            <meshStandardMaterial
              color="#c98968"
            />

          </mesh>

        </group>


        <group
          ref={rightArm}
          position={[
            0.5,
            0.3,
            0
          ]}
        >

          <Cylinder
            position={[
              0,
              -0.45,
              0
            ]}
            scale={[
              0.15,
              0.5,
              0.15
            ]}
            color="#202f58"
          />


          <mesh
            position={[
              0,
              -0.95,
              0
            ]}
          >

            <sphereGeometry
              args={[
                0.16,
                12,
                8
              ]}
            />

            <meshStandardMaterial
              color="#c98968"
            />

          </mesh>

        </group>

      </group>

    </group>

  );
}


/* =========================================================
   350Z TUNADO
========================================================= */

function Car({
  carRef,
  playerRef,
  inCar,
  setInCar
}) {

  const leftDoor =
    useRef();

  const rightDoor =
    useRef();

  const wheelFL =
    useRef();

  const wheelFR =
    useRef();

  const velocity =
    useRef(0);

  const steering =
    useRef(0);


  useFrame((_, delta) => {

    if (!carRef.current)
      return;


    /* =====================================================
       RODAS
    ===================================================== */

    if (wheelFL.current)
      wheelFL.current.rotation.z =
        -steering.current * 0.5;

    if (wheelFR.current)
      wheelFR.current.rotation.z =
        -steering.current * 0.5;


    /* =====================================================
       PORTAS
    ===================================================== */

    const targetDoor =
      inCar ? -1.0 : 0;


    if (leftDoor.current) {

      leftDoor.current.rotation.y =
        THREE.MathUtils.lerp(
          leftDoor.current.rotation.y,
          targetDoor,
          5 * delta
        );

    }


    /* =====================================================
       DIRIGIR
    ===================================================== */

    if (inCar) {

      const keys =
        window.__keys || {};


      const joy =
        window.__joystick || {
          x: 0,
          y: 0
        };


      const throttle =
        keys.w
          ? 1
          : keys.s
            ? -1
            : -joy.y;


      const turn =
        keys.a
          ? -1
          : keys.d
            ? 1
            : joy.x;


      velocity.current +=
        throttle *
        15 *
        delta;


      velocity.current *=
        Math.pow(
          0.35,
          delta
        );


      velocity.current =
        clamp(
          velocity.current,
          -8,
          22
        );


      steering.current =
        THREE.MathUtils.lerp(
          steering.current,
          turn,
          5 * delta
        );


      carRef.current.rotation.y -=
        steering.current *
        delta *
        1.5 *
        Math.min(
          1,
          Math.abs(
            velocity.current
          ) / 3
        );


      const forward =
        new THREE.Vector3(
          0,
          0,
          1
        );


      forward.applyQuaternion(
        carRef.current.quaternion
      );


      carRef.current.position.addScaledVector(
        forward,
        velocity.current * delta
      );


      carRef.current.position.x =
        clamp(
          carRef.current.position.x,
          -CITY_LIMIT,
          CITY_LIMIT
        );


      carRef.current.position.z =
        clamp(
          carRef.current.position.z,
          -CITY_LIMIT,
          CITY_LIMIT
        );


      if (playerRef.current) {

        playerRef.current.position.copy(
          carRef.current.position
        );

        playerRef.current.position.y =
          PLAYER_HEIGHT;

      }

    }

  });


  return (

    <group
      ref={carRef}
      position={[
        0,
        CAR_HEIGHT,
        -8
      ]}
    >

      {/* =================================================
          CORPO
      ================================================= */}

      <Box
        position={[
          0,
          0,
          0
        ]}
        scale={[
          2.35,
          0.65,
          4.4
        ]}
        color="#0b7f48"
      />


      {/* Capô */}

      <Box
        position={[
          0,
          0.35,
          -1.35
        ]}
        scale={[
          2.15,
          0.25,
          1.35
        ]}
        color="#07904f"
      />


      {/* =================================================
          TETO / CABINE
      ================================================= */}

      <Box
        position={[
          0,
          0.72,
          0.35
        ]}
        scale={[
          1.65,
          0.65,
          1.9
        ]}
        color="#11191c"
      />


      {/* =================================================
          VIDRO DIANTEIRO
      ================================================= */}

      <Box
        position={[
          0,
          0.76,
          -0.72
        ]}
        scale={[
          1.55,
          0.48,
          0.08
        ]}
        color="#6d9bb1"
        rotation={[
          0.35,
          0,
          0
        ]}
      />


      {/* =================================================
          VIDRO TRASEIRO
      ================================================= */}

      <Box
        position={[
          0,
          0.76,
          1.25
        ]}
        scale={[
          1.55,
          0.48,
          0.08
        ]}
        color="#527b8b"
        rotation={[
          -0.25,
          0,
          0
        ]}
      />


      {/* =================================================
          SPOILER
      ================================================= */}

      <Box
        position={[
          0,
          0.95,
          2.05
        ]}
        scale={[
          2.1,
          0.12,
          0.35
        ]}
        color="#101317"
      />


      <Cylinder
        position={[
          -0.75,
          0.75,
          2.0
        ]}
        scale={[
          0.08,
          0.45,
          0.08
        ]}
        color="#101317"
      />


      <Cylinder
        position={[
          0.75,
          0.75,
          2.0
        ]}
        scale={[
          0.08,
          0.45,
          0.08
        ]}
        color="#101317"
      />


      {/* =================================================
          PORTA ESQUERDA
      ================================================= */}

      <group
        ref={leftDoor}
        position={[
          -1.12,
          0.55,
          0.25
        ]}
      >

        <Box
          position={[
            0,
            0,
            0
          ]}
          scale={[
            0.12,
            0.85,
            1.65
          ]}
          color="#087c45"
        />

      </group>


      {/* =================================================
          FARÓIS
      ================================================= */}

      <Box
        position={[
          -0.75,
          0.3,
          -2.23
        ]}
        scale={[
          0.5,
          0.18,
          0.08
        ]}
        color="#f7f1b5"
      />


      <Box
        position={[
          0.75,
          0.3,
          -2.23
        ]}
        scale={[
          0.5,
          0.18,
          0.08
        ]}
        color="#f7f1b5"
      />


      {/* =================================================
          LANTERNAS
      ================================================= */}

      <Box
        position={[
          -0.75,
          0.32,
          2.23
        ]}
        scale={[
          0.55,
          0.2,
          0.08
        ]}
        color="#a50e18"
      />


      <Box
        position={[
          0.75,
          0.32,
          2.23
        ]}
        scale={[
          0.55,
          0.2,
          0.08
        ]}
        color="#a50e18"
      />


      {/* =================================================
          RODAS
      ================================================= */}

      {[
        [-1.15, -1.45],
        [1.15, -1.45],
        [-1.15, 1.45],
        [1.15, 1.45]
      ].map(([x, z], i) => (

        <group
          key={"wheel-" + i}
          ref={
            i === 0
              ? wheelFL
              : i === 1
                ? wheelFR
                : undefined
          }
          position={[
            x,
            -0.45,
            z
          ]}
        >

          <mesh
            rotation={[
              Math.PI / 2,
              0,
              0
            ]}
            castShadow
          >

            <cylinderGeometry
              args={[
                0.55,
                0.55,
                0.3,
                20
              ]}
            />

            <meshStandardMaterial
              color="#111"
              roughness={0.9}
            />

          </mesh>


          <mesh
            rotation={[
              Math.PI / 2,
              0,
              0
            ]}
          >

            <cylinderGeometry
              args={[
                0.25,
                0.25,
                0.32,
                16
              ]}
            />

            <meshStandardMaterial
              color="#bfc2c4"
              metalness={0.8}
            />

          </mesh>

        </group>

      ))}

    </group>

  );
}


/* =========================================================
   COLISÃO
========================================================= */

function collides(
  position,
  obstacles,
  radius = 0.8
) {

  if (
    position.x < -CITY_LIMIT ||
    position.x > CITY_LIMIT ||
    position.z < -CITY_LIMIT ||
    position.z > CITY_LIMIT
  ) {

    return true;

  }


  for (const box of obstacles.current) {

    if (
      position.x >
        box.minX - radius &&
      position.x <
        box.maxX + radius &&
      position.z >
        box.minZ - radius &&
      position.z <
        box.maxZ + radius
    ) {

      return true;

    }

  }


  return false;
}


/* =========================================================
   MOVIMENTO DO PERSONAGEM
========================================================= */

function PlayerController({
  playerRef,
  carRef,
  inCar,
  obstacles,
  setAnimation
}) {

  const velocity =
    useRef(
      new THREE.Vector3()
    );


  useFrame((_, delta) => {

    if (
      !playerRef.current ||
      inCar
    ) {

      setAnimation("idle");

      return;

    }


    const keys =
      window.__keys || {};


    const joy =
      window.__joystick || {
        x: 0,
        y: 0
      };


    const x =
      (keys.d ? 1 : 0) -
      (keys.a ? 1 : 0) +
      joy.x;


    const z =
      (keys.s ? 1 : 0) -
      (keys.w ? 1 : 0) +
      joy.y;


    const direction =
      new THREE.Vector3(
        x,
        0,
        z
      );


    if (
      direction.lengthSq() > 1
    ) {

      direction.normalize();

    }


    const moving =
      direction.lengthSq() > 0.01;


    setAnimation(
      moving
        ? "walk"
        : "idle"
    );


    const speed =
      6.5;


    velocity.current.lerp(
      direction.multiplyScalar(speed),
      1 -
        Math.pow(
          0.001,
          delta
        )
    );


    const next =
      playerRef.current.position
        .clone()
        .addScaledVector(
          velocity.current,
          delta
        );


    if (
      !collides(
        next,
        obstacles,
        0.65
      )
    ) {

      playerRef.current.position.copy(
        next
      );

    }


    if (
      moving
    ) {

      playerRef.current.rotation.y =
        Math.atan2(
          direction.x,
          direction.z
        );

    }


    /* =====================================================
       ENTRAR NO CARRO
    ===================================================== */

    if (
      keys.e &&
      !window.__ePressed
    ) {

      window.__ePressed = true;


      const distance =
        playerRef.current.position.distanceTo(
          carRef.current.position
        );


      if (
        distance < 4
      ) {

        window.__enterCar = true;

      }

    }


    if (!keys.e) {

      window.__ePressed = false;

    }

  });


  return null;
}


/* =========================================================
   CÂMERA LIVRE
========================================================= */

function CameraController({
  target,
  inCar
}) {

  useFrame(({ camera }) => {

    if (!target.current)
      return;


    const targetPosition =
      target.current.position;


    const distance =
      inCar
        ? 9
        : 7;


    const yaw =
      window.__camera.yaw;


    const pitch =
      window.__camera.pitch;


    const offset =
      new THREE.Vector3(
        Math.sin(yaw) *
          Math.cos(pitch) *
          distance,

        Math.sin(pitch) *
          distance,

        Math.cos(yaw) *
          Math.cos(pitch) *
          distance
      );


    const desired =
      targetPosition
        .clone()
        .add(offset);


    desired.y +=
      inCar
        ? 2.8
        : 2.2;


    camera.position.lerp(
      desired,
      0.12
    );


    camera.lookAt(
      targetPosition.x,
      targetPosition.y + 0.5,
      targetPosition.z
    );

  });


  return null;
}


/* =========================================================
   GAME
========================================================= */

function Game({
  setMessage
}) {

  const playerRef =
    useRef();


  const carRef =
    useRef();


  const obstacles =
    useRef([]);


  const [inCar, setInCar] =
    useState(false);


  const [
    animation,
    setAnimation
  ] = useState("idle");


  useEffect(() => {

    const down = e => {

      window.__keys[
        e.key.toLowerCase()
      ] = true;

    };


    const up = e => {

      window.__keys[
        e.key.toLowerCase()
      ] = false;

    };


    window.addEventListener(
      "keydown",
      down
    );

    window.addEventListener(
      "keyup",
      up
    );


    return () => {

      window.removeEventListener(
        "keydown",
        down
      );

      window.removeEventListener(
        "keyup",
        up
      );

    };

  }, []);


  useEffect(() => {

    setMessage(
      inCar
        ? "DIRIGINDO • Analógico = direção/aceleração"
        : "Aproxime-se do 350Z e toque E para entrar"
    );

  }, [
    inCar,
    setMessage
  ]);


  useEffect(() => {

    const interval =
      setInterval(() => {

        if (
          window.__enterCar
        ) {

          window.__enterCar = false;


          if (
            !inCar
          ) {

            setInCar(true);

            setMessage(
              "Você entrou no 350Z"
            );

          }

        }

      }, 50);


    return () =>
      clearInterval(interval);

  }, [inCar, setMessage]);


  /* =======================================================
     SAIR DO CARRO
  ======================================================= */

  useEffect(() => {

    const handler = e => {

      if (
        e.key.toLowerCase() === "e" &&
        inCar &&
        !window.__exitPressed
      ) {

        window.__exitPressed = true;

        setInCar(false);


        if (
          playerRef.current &&
          carRef.current
        ) {

          const exit =
            new THREE.Vector3(
              -2.5,
              PLAYER_HEIGHT,
              0
            );


          exit.applyQuaternion(
            carRef.current.quaternion
          );


          exit.add(
            carRef.current.position
          );


          playerRef.current.position.copy(
            exit
          );

        }

      }

    };


    const up = e => {

      if (
        e.key.toLowerCase() === "e"
      ) {

        window.__exitPressed =
          false;

      }

    };


    window.addEventListener(
      "keydown",
      handler
    );

    window.addEventListener(
      "keyup",
      up
    );


    return () => {

      window.removeEventListener(
        "keydown",
        handler
      );

      window.removeEventListener(
        "keyup",
        up
      );

    };

  }, [inCar]);


  return (

    <>

      <City
        obstacles={obstacles}
      />


      <Car
        carRef={carRef}
        playerRef={playerRef}
        inCar={inCar}
        setInCar={setInCar}
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
      />


      <CameraController
        target={
          inCar
            ? carRef
            : playerRef
        }
        inCar={inCar}
      />


      {/* =================================================
          ILUMINAÇÃO
      ================================================= */}

      <ambientLight
        intensity={1.7}
      />


      <directionalLight
        position={[
          20,
          35,
          15
        ]}
        intensity={3}
        castShadow
        shadow-mapSize-width={
          2048
        }
        shadow-mapSize-height={
          2048
        }
      />

    </>

  );
}


/* =========================================================
   ANALÓGICO
========================================================= */

function Joystick() {

  const baseRef =
    useRef();

  const knobRef =
    useRef();


  const active =
    useRef(false);


  function move(e) {

    if (
      !active.current ||
      !baseRef.current
    ) {

      return;

    }


    const rect =
      baseRef.current.getBoundingClientRect();


    const centerX =
      rect.left +
      rect.width / 2;


    const centerY =
      rect.top +
      rect.height / 2;


    const radius =
      rect.width / 2;


    let x =
      e.clientX -
      centerX;


    let y =
      e.clientY -
      centerY;


    const length =
      Math.sqrt(
        x * x +
        y * y
      );


    if (
      length > radius
    ) {

      x =
        x / length *
        radius;

      y =
        y / length *
        radius;

    }


    window.__joystick.x =
      x / radius;


    window.__joystick.y =
      y / radius;


    if (knobRef.current) {

      knobRef.current.style.transform =
        `translate(${x}px, ${y}px)`;

    }

  }


  function start(e) {

    active.current =
      true;

    e.currentTarget.setPointerCapture(
      e.pointerId
    );

    move(e);

  }


  function end() {

    active.current =
      false;


    window.__joystick.x = 0;

    window.__joystick.y = 0;


    if (knobRef.current) {

      knobRef.current.style.transform =
        "translate(0px, 0px)";

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
        if (active.current)
          end();
      }}
    >

      <div
        className="joystick-knob"
        ref={knobRef}
      />

    </div>

  );
}


/* =========================================================
   BOTÃO E
========================================================= */

function ActionButton({
  onClick
}) {

  return (

    <button
      className="action-button"
      onPointerDown={onClick}
    >

      E

    </button>

  );
}


/* =========================================================
   CÂMERA TOUCH
========================================================= */

function CameraTouch() {

  const active =
    useRef(false);


  const last =
    useRef({
      x: 0,
      y: 0
    });


  function start(e) {

    if (
      e.target.closest(
        ".joystick"
      ) ||
      e.target.closest(
        ".action-button"
      )
    ) {

      return;

    }


    active.current =
      true;


    last.current = {
      x: e.clientX,
      y: e.clientY
    };

  }


  function move(e) {

    if (!active.current)
      return;


    const dx =
      e.clientX -
      last.current.x;


    const dy =
      e.clientY -
      last.current.y;


    last.current = {
      x: e.clientX,
      y: e.clientY
    };


    window.__camera.yaw -=
      dx * 0.006;


    window.__camera.pitch =
      clamp(
        window.__camera.pitch -
          dy * 0.004,
        -0.45,
        0.9
      );

  }


  function end() {

    active.current =
      false;

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

  const [
    started,
    setStarted
  ] = useState(false);


  const [
    message,
    setMessage
  ] = useState("");


  return (

    <div className="app">


      {!started && (

        <div className="menu">

          <div className="menu-card">

            <div className="logo">
              MINI CITY
            </div>


            <div className="subtitle">
              OPEN WORLD 3D
            </div>


            <p>
              Explore a small city,
              walk around and drive
              a tuned green sports car.
            </p>


            <button
              className="play-button"
              onClick={() =>
                setStarted(true)
              }
            >
              JOGAR
            </button>


            <div className="controls-info">

              <span>
                🕹️ Analógico
              </span>

              <span>
                👆 Câmera livre
              </span>

              <span>
                🚗 Dirigir
              </span>

            </div>

          </div>

        </div>

      )}


      {started && (

        <>

          <Canvas
            shadows
            dpr={[
              1,
              1.5
            ]}
            camera={{
              position: [
                0,
                5,
                10
              ],
              fov: 65
            }}
            gl={{
              antialias: true
            }}
          >

            <Sky
              sunPosition={[
                100,
                40,
                20
              ]}
            />


            <Game
              setMessage={
                setMessage
              }
            />

          </Canvas>


          <CameraTouch />


          <div className="hud">

            <div className="game-title">
              MINI CITY
            </div>


            <div className="message">
              {message}
            </div>

          </div>


          <Joystick />


          <ActionButton
            onClick={() => {

              window.__keys.e =
                true;


              setTimeout(() => {

                window.__keys.e =
                  false;

              }, 100);

            }}
          />


          <div className="camera-help">
            ARRaste para olhar
          </div>

        </>

      )}

    </div>

  );
}


/* =========================================================
   START
========================================================= */

createRoot(
  document.getElementById("root")
).render(
  <App />
);
