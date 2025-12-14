import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

export default function PermissionGate({
  onGranted,
}: {
  onGranted: () => void;
}) {
  const askPermissions = async () => {
    if (!Capacitor.isNativePlatform()) {
      onGranted();
      return;
    }

    const cam = await Camera.requestPermissions({
      permissions: ['camera'],
    });

    await Filesystem.requestPermissions();

    if (cam.camera === 'granted') {
      onGranted();
    } else {
      alert('Camera permission is required');
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
      }}
    >
      <button
        onClick={askPermissions}
        style={{
          padding: '14px 22px',
          fontSize: '16px',
          borderRadius: '12px',
          background: '#FFD60A',
          color: '#000',
          border: 'none',
        }}
      >
        Enable Camera Access
      </button>
    </div>
  );
}