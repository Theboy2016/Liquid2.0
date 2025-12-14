import { useState } from 'react';
import PermissionGate from './components/PermissionGate';
import LiquidGlassCamera from './components/LiquidGlassCamera';

export default function App() {
  const [allowed, setAllowed] = useState(false);

  if (!allowed) {
    return <PermissionGate onGranted={() => setAllowed(true)} />;
  }

  return (
    <div className="w-full h-[100dvh] bg-black text-white relative overflow-hidden">
      <LiquidGlassCamera />
    </div>
  );
}