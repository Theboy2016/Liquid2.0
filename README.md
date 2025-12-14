# LiquidGlass Camera

A high-fidelity PWA camera experience with glassmorphism UI.

## Capacitor Native Volume Button Integration

To enable physical volume button capture on Android/iOS when using Capacitor:

1. Install the Capacitor plugin (example logic, verify generic plugin availability or implement native code):
   `npm install @capacitor-community/volume-buttons` (hypothetical) or use `MainActivity.java` override.

2. **Native Implementation (Android Example)**
   In your `MainActivity.java`, override `onKeyDown`:

   ```java
   @Override
   public boolean onKeyDown(int keyCode, KeyEvent event) {
       if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
           this.bridge.eval("window.onNativeVolumePress && window.onNativeVolumePress()", new ValueCallback<String>() {
               @Override
               public void onReceiveValue(String s) {}
           });
           return true; // Prevent system volume change
       }
       return super.onKeyDown(keyCode, event);
   }
   ```

3. **Required Permissions**
   Ensure `AndroidManifest.xml` has camera permissions.

## Features
- **Top Bar**: Single glass layer (`.ios-glass-top`).
- **Modes**: Video (720p/1080p), Photo, Portrait.
- **Controls**: Drag-to-slide mode capsule, tap-to-focus, exposure, styles.
- **Gallery**: IndexedDB stored photos/videos.
