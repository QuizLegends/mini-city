import React from "react";

export function TokyoLighting() {
  return (
    <>
      <ambientLight intensity={1.0} color="#b0c0d8" />
      <hemisphereLight args={["#7a9ab8", "#1a1520", 0.6]} />

      {/* UMA luz principal com sombra */}
      <directionalLight
        position={[50, 80, 40]}
        intensity={1.2}
        color="#e8f0ff"
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-far={200}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />

      {/* Só 2 point lights no mapa inteiro */}
      <pointLight position={[0, 25, 0]} intensity={0.8} distance={150} color="#6080a0" />
      <pointLight position={[0, 20, 160]} intensity={0.6} distance={100} color="#ff6b9d" />

      <fog attach="fog" args={["#1a2230", 50, 200]} />
    </>
  );
}
