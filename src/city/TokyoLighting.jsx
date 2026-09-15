import React from "react";

export function TokyoLighting() {
  return (
    <>
      {/* Mais claro para enxergar */}
      <ambientLight intensity={0.85} color="#c8d4e8" />

      <hemisphereLight args={["#6a8aad", "#1a1520", 0.7]} />

      {/* Luz principal */}
      <directionalLight
        position={[40, 90, 30]}
        intensity={1.1}
        color="#e8f0ff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={350}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
      />

      {/* Segunda luz (preenche sombra) */}
      <directionalLight
        position={[-30, 40, -20]}
        intensity={0.35}
        color="#a0b8d0"
      />

      {/* Glow urbano */}
      <pointLight position={[0, 30, 0]} intensity={1.2} distance={200} color="#6090c0" />
      <pointLight position={[0, 20, 180]} intensity={1.0} distance={140} color="#ff6b9d" />
      <pointLight position={[55, 35, -55]} intensity={0.9} distance={100} color="#40f0ff" />
      <pointLight position={[-40, 18, 80]} intensity={0.7} distance={100} color="#c070ff" />
      <pointLight position={[60, 15, 40]} intensity={0.5} distance={80} color="#ffd080" />

      {/* Névoa mais suave e clara */}
      <fog attach="fog" args={["#1a2230", 60, 280]} />
    </>
  );
}
