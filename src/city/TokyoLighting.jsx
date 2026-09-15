import React from "react";

export function TokyoLighting() {
  return (
    <>
      <ambientLight intensity={0.25} color="#1a2030" />
      <hemisphereLight args={["#1b2838", "#0a0a12", 0.35]} />
      <directionalLight
        position={[30, 80, 20]}
        intensity={0.35}
        color="#a8c0d8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={350}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
      />
      <pointLight position={[0, 25, 0]} intensity={0.6} distance={180} color="#4060a0" />
      <pointLight position={[0, 18, 180]} intensity={0.8} distance={120} color="#ff2d6a" />
      <pointLight position={[55, 30, -55]} intensity={0.7} distance={80} color="#00e5ff" />
      <pointLight position={[-40, 15, 80]} intensity={0.5} distance={90} color="#b14eff" />
      <fog attach="fog" args={["#080a10", 40, 220]} />
    </>
  );
}
