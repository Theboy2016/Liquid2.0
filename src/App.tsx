import React from 'react';
import LiquidGlassCamera from "../components/LiquidGlassCamera";

export default function App() {
  return (
    <div className="w-full h-[100dvh] bg-black text-white relative overflow-hidden">
      <LiquidGlassCamera />
    </div>
  );
}