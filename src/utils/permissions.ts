import { Capacitor } from '@capacitor/core';

export async function requestAndroidPermissions(): Promise<boolean> {
  // Only run on Android native
  if (Capacitor.getPlatform() !== 'android') return true;

  try {
    // Dynamic imports to prevent Web/iOS build errors and ensure we use the bundled native plugins
    const { Camera } = await import('@capacitor/camera');
    const { Filesystem } = await import('@capacitor/filesystem');

    // 1. Request Camera & Gallery
    // 'camera' covers android.permission.CAMERA
    // 'photos' covers READ_MEDIA_IMAGES (Android 13+) or READ_EXTERNAL_STORAGE (Android 12-)
    const cameraResult = await Camera.requestPermissions({ 
      permissions: ['camera', 'photos'] 
    });

    // 2. Request Filesystem (for saving files)
    const fsResult = await Filesystem.requestPermissions();

    const cameraGranted = cameraResult.camera === 'granted' || cameraResult.camera === 'limited';
    const photosGranted = cameraResult.photos === 'granted' || cameraResult.photos === 'limited';
    // Filesystem often returns 'granted' on Android 11+ for public storage automatically if Media is granted
    const fsGranted = fsResult.publicStorage === 'granted';

    return cameraGranted && photosGranted;
  } catch (error) {
    console.error("Android Permission Request Failed:", error);
    return false;
  }
}

export async function checkPermissionsStatus(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return true;

  try {
    const { Camera } = await import('@capacitor/camera');
    const result = await Camera.checkPermissions();
    return result.camera === 'granted' && (result.photos === 'granted' || result.photos === 'limited');
  } catch(e) {
    return false;
  }
}