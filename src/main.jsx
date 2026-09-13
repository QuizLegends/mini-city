import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import * as THREE from "three";

import "./style.css";

const CITY = 80;
const PLAYER_HEIGHT = 1.75;


/* =========================
   OBJETO CUBO
========================= */

function Box({
  position,
  scale,
  color,
  cast = true
}) {
  return (
    <mesh
      position={position}
      scale={scale}
      castShadow={cast}
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />

      <meshStandardMaterial color={color} />
    </mesh>
  );
}


/* =========================
   CIDADE
========================= */

function City() {

  const buildings = [

    [-28, 5, -28, 8, 10, 8],
    [-15, 8, -30, 7, 16, 7],
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

  return (
    <>

      {/* CHÃO */}

      <Box
        position={[0, -0.15, 0]}
        scale={[CITY, 0.3, CITY]}
        color="#4d5258"
      />

      <Box
        position={[0, 0.02, 0]}
        scale={[CITY, 0.08, CITY]}
        color="#77736b"
        cast={false}
      />


      {/* ESTRADAS */}

      <Box
        position={[0, 0.08, 0]}
        scale={[12, 0.05, CITY]}
        color="#25282c"
        cast={false}
      />

      <Box
        position={[0, 0.09, 0]}
        scale={[CITY, 0.05, 12]}
        color="#25282c"
        cast={false}
      />

      <Box
        position={[-25, 0.1, 0]}
        scale={[6, 0.05, CITY]}
        color="#303338"
        cast={false}
      />

      <Box
        position={[25, 0.1, 0]}
        scale={[6, 0.05, CITY]}
        color="#303338"
        cast={false}
      />


      {/* =========================
         ESTÁDIO
      ========================= */}

      <group position={[0, 1, 22]}>

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <ringGeometry args={[9, 14, 48]} />

          <meshStandardMaterial color="#555b62" />
        </mesh>


        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.03, 0]}
        >
          <circleGeometry args={[8.5, 48]} />

          <meshStandardMaterial color="#1f6b3a" />
        </mesh>


        <mesh
          position={[0, 2, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[11.5, 2, 8, 48]} />

          <meshStandardMaterial color="#b8b8b8" />
        </mesh>


        <Box
          position={[0, 0.5, 0]}
          scale={[10, 0.8, 1]}
          color="#eeeeee"
        />

        <Box
          position={[0, 0.5, 0]}
          scale={[1, 0.8, 10]}
          color="#eeeeee"
        />

      </group>


      {/* =========================
         PRÉDIOS
      ========================= */}

      {buildings.map((b, i) => (

        <Box
          key={i}
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
            "#8c9298",
            "#a67c64",
            "#65747d",
            "#b1a58e",
            "#6d6b73"
          ][i % 5]}
        />

      ))}


      {/* =========================
         ÁRVORES
      ========================= */}

      {[-35, -20, 20, 35]
        .flatMap(x =>
          [-32, -20, 20, 34]
            .map(z => [x, z])
        )
        .map(([x, z], i) => (

          <group
            key={"tree-" + i}
            position={[x, 0, z]}
          >

            <mesh
              position={[0, 1.3, 0]}
              castShadow
            >
              <cylinderGeometry
                args={[0.35, 0.45, 2.6, 8]}
              />

              <meshStandardMaterial
                color="#5a3d25"
              />
            </mesh>


            <mesh
              position={[0, 3.1, 0]}
              castShadow
            >
              <sphereGeometry
                args={[1.6, 10, 8]}
              />

              <meshStandardMaterial
                color="#28703a"
              />
            </mesh>

          </group>

        ))}

    </>
  );
}


/* =========================
   CARRO
========================= */

function Car({
  playerRef,
  inCar
}) {

  const car = useRef();

  const velocity = useRef(0);

  const angle = useRef(0);


  useFrame((_, delta) => {

    if (!car.current) return;


    if (inCar) {

      const keys = window.__keys || {};


      /* ACELERAR */

      if (keys.w) {
        velocity.current += 13 * delta;
      }


      /* FREAR / RÉ */

      if (keys.s) {
        velocity.current -= 18 * delta;
      }


      /* ATRITO */

      if (!keys.w && !keys.s) {

        velocity.current *=
          Math.pow(0.08, delta);

      }


      velocity.current =
        THREE.MathUtils.clamp(
          velocity.current,
          -8,
          18
        );


      /* DIREÇÃO */

      if (keys.a) {

        angle.current +=
          1.5 *
          delta *
          (Math.abs(velocity.current) / 10 + 0.2);

      }


      if (keys.d) {

        angle.current -=
          1.5 *
          delta *
          (Math.abs(velocity.current) / 10 + 0.2);

      }


      car.current.rotation.y += angle.current;


      angle.current *=
        Math.pow(0.01, delta);


      /* MOVIMENTO */

      const dir =
        new THREE.Vector3(
          Math.sin(car.current.rotation.y),
          0,
          Math.cos(car.current.rotation.y)
        );


      car.current.position.addScaledVector(
        dir,
        velocity.current * delta
      );


      /* LIMITES DO MAPA */

      car.current.position.x =
        THREE.MathUtils.clamp(
          car.current.position.x,
          -37,
          37
        );


      car.current.position.z =
        THREE.MathUtils.clamp(
          car.current.position.z,
          -37,
          37
        );


      /* POSIÇÃO DO JOGADOR */

      playerRef.current.position.copy(
        car.current.position
      );

      playerRef.current.position.y =
        PLAYER_HEIGHT;

    }

  });


  return (

    <group
      ref={car}
      position={[0, 0.65, -8]}
    >

      {/* CORPO */}

      <Box
        position={[0, 0, 0]}
        scale={[2.2, 0.8, 4]}
        color="#b52b35"
      />


      {/* CABINE */}

      <Box
        position={[0, 0.7, -0.1]}
        scale={[1.7, 0.7, 2]}
        color="#222831"
      />


      {/* VIDROS */}

      <Box
        position={[0, 0.72, -1.4]}
        scale={[1.8, 0.55, 0.7]}
        color="#8fa5b5"
      />

      <Box
        position={[0, 0.72, 1.25]}
        scale={[1.8, 0.55, 0.7]}
        color="#8fa5b5"
      />


      {/* RODAS */}

      {[-0.9, 0.9]
        .flatMap(x =>
          [-1.25, 1.25]
            .map(z => (

              <mesh
                key={x + z}
                position={[x, -0.35, z]}
                rotation={[Math.PI / 2, 0, 0]}
              >

                <cylinderGeometry
                  args={[0.42, 0.42, 0.25, 16]}
                />

                <meshStandardMaterial
                  color="#111"
                />

              </mesh>

            ))
        )}

    </group>

  );
}


/* =========================
   PERSONAGEM
========================= */

function Player({
  playerRef,
  inCar
}) {

  const vel =
    useRef(new THREE.Vector3());


  useFrame((_, delta) => {

    if (inCar) return;


    const keys =
      window.__keys || {};


    const dir =
      new THREE.Vector3(

        (keys.d ? 1 : 0) -
        (keys.a ? 1 : 0),

        0,

        (keys.s ? 1 : 0) -
        (keys.w ? 1 : 0)

      );


    if (dir.lengthSq()) {
      dir.normalize();
    }


    const speed = 7;


    vel.current.lerp(
      dir.multiplyScalar(speed),
      1 - Math.pow(0.001, delta)
    );


    playerRef.current.position.addScaledVector(
      vel.current,
      delta
    );


    playerRef.current.position.x =
      THREE.MathUtils.clamp(
        playerRef.current.position.x,
        -37,
        37
      );


    playerRef.current.position.z =
      THREE.MathUtils.clamp(
        playerRef.current.position.z,
        -37,
        37
      );


    playerRef.current.position.y =
      PLAYER_HEIGHT;

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

      <mesh castShadow>

        <capsuleGeometry
          args={[
            0.38,
            1.0,
            6,
            12
          ]}
        />

        <meshStandardMaterial
          color="#2d5bd1"
        />

      </mesh>

    </group>

  );
}


/* =========================
   CÂMERA
========================= */

function FollowCamera({
  target,
  inCar
}) {

  useFrame(({ camera }) => {

    if (!target.current) return;


    const p =
      target.current.position;


    const desired =
      new THREE.Vector3(

        p.x,

        inCar ? 8 : 5.5,

        p.z + (inCar ? 10 : 8)

      );


    camera.position.lerp(
      desired,
      0.12
    );


    camera.lookAt(
      p.x,
      1,
      p.z
    );

  });


  return null;
}


/* =========================
   GAME
========================= */

function Game({
  setMessage
}) {

  const player =
    useRef();


  const car =
    useRef();


  const [inCar, setInCar] =
    useState(false);


  useEffect(() => {

    window.__keys = {};


    const down = e => {

      const key =
        e.key.toLowerCase();


      window.__keys[key] = true;


      /* ENTRAR / SAIR */

      if (key === "e") {

        if (!player.current || !car.current)
          return;


        const p =
          player.current.position;


        const c =
          car.current.position;


        if (
          p.distanceTo(c) < 4 ||
          inCar
        ) {

          setInCar(v => !v);

        }

      }

    };


    const up = e => {

      const key =
        e.key.toLowerCase();


      window.__keys[key] = false;

    };


    window.addEventListener(
      "keydown",
      down
    );

    window.addEventListener(
      "keyup",
      up
    );


    setMessage(
      "WASD para andar • E para entrar/sair do carro"
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

  }, [inCar, setMessage]);


  return (

    <>

      <City />


      <group ref={car}>

        <Car
          playerRef={player}
          inCar={inCar}
        />

      </group>


      <Player
        playerRef={player}
        inCar={inCar}
      />


      <FollowCamera
        target={player}
        inCar={inCar}
      />


      <ambientLight
        intensity={1.5}
      />


      <directionalLight
        position={[20, 30, 10]}
        intensity={3}
        castShadow
        shadow-mapSize={[
          2048,
          2048
        ]}
      />

    </>

  );
}


/* =========================
   APP
========================= */

function App() {

  const [
    message,
    setMessage
  ] = useState("");


  const [
    started,
    setStarted
  ] = useState(false);


  return (

    <div className="app">


      {!started && (

        <div className="menu">

          <h1>
            MINI CITY
          </h1>


          <p>
            Um pequeno protótipo 3D
            inspirado em jogos de mundo aberto.
          </p>


          <button
            onClick={() =>
              setStarted(true)
            }
          >
            JOGAR
          </button>


          <small>
            WASD = movimento •
            E = entrar/sair
          </small>

        </div>

      )}


      {started && (

        <Canvas
          shadows
          camera={{
            position: [
              0,
              6,
              10
            ],
            fov: 65
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
            setMessage={setMessage}
          />

        </Canvas>

      )}


      {started && (

        <div className="hud">

          <b>
            MINI CITY
          </b>


          <span>
            {message}
          </span>


          <div className="mobile">

            <button
              onPointerDown={() => {
                window.__keys.w = true;
              }}
              onPointerUp={() => {
                window.__keys.w = false;
              }}
            >
              ▲
            </button>


            <div>

              <button
                onPointerDown={() => {
                  window.__keys.a = true;
                }}
                onPointerUp={() => {
                  window.__keys.a = false;
                }}
              >
                ◀
              </button>


              <button
                onPointerDown={() => {
                  window.__keys.s = true;
                }}
                onPointerUp={() => {
                  window.__keys.s = false;
                }}
              >
                ▼
              </button>


              <button
                onPointerDown={() => {
                  window.__keys.d = true;
                }}
                onPointerUp={() => {
                  window.__keys.d = false;
                }}
              >
                ▶
              </button>

            </div>


            <button
              onClick={() => {

                window.dispatchEvent(
                  new KeyboardEvent(
                    "keydown",
                    {
                      key: "e"
                    }
                  )
                );

              }}
            >
              E
            </button>

          </div>

        </div>

      )}

    </div>

  );
}


createRoot(
  document.getElementById("root")
).render(
  <App />
);
