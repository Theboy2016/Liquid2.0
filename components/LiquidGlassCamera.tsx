import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  requestAndroidPermissions,
  checkPermissionsStatus
} from "../src/utils/permissions";
import { 
  Zap, 
  ZapOff, 
  Aperture, 
  Timer, 
  Moon, 
  SwitchCamera, 
  Image as ImageIcon,
  Video,
  Ratio,
  Sliders,
  ChevronUp,
  Settings,
  Sun,
  Lock,
  Camera,
  Mic,
  Folder
} from 'lucide-react';

/* --- IndexedDB Helper --- */
const DB_NAME = "liquidglass-db";
const STORE_NAME = "media";

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = (e: any) => resolve(e.target.result);
    req.onerror = (e) => reject(e);
  });
};

const dbAdd = async (record: any) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const dbGetAll = async (): Promise<any[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

/* --- Types --- */
type FilterStyle = { name: string; filter: string };
type AspectRatio = "full" | "4:3" | "1:1";
type CameraMode = "video" | "photo"; 
type Resolution = "720p" | "1080p";

const MODES: CameraMode[] = ["video", "photo"];

const STYLES: FilterStyle[] = [
  { name: "Normal", filter: "none" },
  { name: "Vivid", filter: "contrast(1.1) saturate(1.3)" },
  { name: "Mono", filter: "grayscale(1) contrast(1.1)" },
  { name: "Cool", filter: "sepia(0.2) hue-rotate(180deg) saturate(0.9)" },
  { name: "Warm", filter: "sepia(0.3) saturate(1.2) contrast(1.05)" },
  { name: "Cyber", filter: "hue-rotate(190deg) contrast(1.2)" },
];

const ZOOM_LEVELS = [0.5, 1, 2, 5, 10];

export default function LiquidGlassCamera() {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]); 
  const capsuleRef = useRef<HTMLDivElement>(null);

  // Guard Refs (Transient State)
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);

  // State
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [mode, setMode] = useState<CameraMode>("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Blocks UI during transition
  
  // Controls
  const [flashOn, setFlashOn] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [aspect, setAspect] = useState<AspectRatio>("full");
  const [nightMode, setNightMode] = useState(false);
  const [styleIndex, setStyleIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  
  // Resolution State
  const [videoRes, setVideoRes] = useState<Resolution>("1080p");
  
  // UI State
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gallery, setGallery] = useState<any[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [showFlashOverlay, setShowFlashOverlay] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Animation States
  const [shutterPressed, setShutterPressed] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  // Focus
  const [focusPoint, setFocusPoint] = useState<{x: number, y: number, visible: boolean} | null>(null);

  // Dragging
  const [isDragging, setIsDragging] = useState(false);
  const [pinchDist, setPinchDist] = useState<number | null>(null);

  // --- Helper: Toast ---
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // --- Initialization ---
  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    try {
      let videoConstraints: any = {
        facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      };

      if (mode === 'video') {
         if (videoRes === '720p') {
            videoConstraints = { facingMode, width: { exact: 1280 }, height: { exact: 720 }, frameRate: { ideal: 30 } };
         } else {
            videoConstraints = { facingMode, width: { exact: 1920 }, height: { exact: 1080 }, frameRate: { ideal: 30 } };
         }
      }

      try {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: mode === 'video', video: videoConstraints });
         streamRef.current = stream;
      } catch (e) {
         console.warn("Constraint fallback triggered");
         const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: mode === 'video', 
            video: { facingMode, width: { ideal: videoRes === '720p' ? 1280 : 1920 } } 
         });
         streamRef.current = stream;
      }

      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(e => console.error("Play error:", e));
        
        // Apply initial zoom
        const track = streamRef.current.getVideoTracks()[0];
        if (track) {
           applyZoom(zoom, track);
        }
      }
      setHasPermission(true);

      if (flashOn) {
         const track = streamRef.current?.getVideoTracks()[0];
         if (track) {
            try { await track.applyConstraints({ advanced: [{ torch: true } as any] }); } catch(e){}
         }
      }

    } catch (err) {
      console.error("Camera init failed:", err);
      // Only set false if we really can't get it (user denied)
      setHasPermission(false);
      showToast("Camera access failed");
    }
  }, [facingMode, mode, videoRes]);

  const applyZoom = async (z: number, track?: MediaStreamTrack) => {
     const t = track || streamRef.current?.getVideoTracks()[0];
     if (!t) return;
     const cap = t.getCapabilities ? t.getCapabilities() : {};
     if ('zoom' in cap) {
        try {
           await t.applyConstraints({ advanced: [{ zoom: z } as any] });
        } catch (e) { console.warn('Zoom failed', e); }
     }
  };

  const handleZoomSelect = (z: number) => {
     setZoom(z);
     applyZoom(z);
  };

  // --- Main Effect ---
  useEffect(() => {
    // Logic: If Native, check status first. If granted, start camera. If not, wait for user action (show permission screen).
    // If Web, just start camera (browser handles prompt).
    const init = async () => {
      if (Capacitor.isNativePlatform()) {
        const granted = await checkPermissionsStatus();
        if (granted) {
          startCamera();
        } else {
          setHasPermission(false); // Shows the 'Grant Permissions' screen
        }
      } else {
        startCamera();
      }
    };
    init();
    
    loadGallery();
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [startCamera]);

  // --- Volume Button Handler ---
  useEffect(() => {
    const handleVolumeTrigger = () => {
       setShutterPressed(true);
       setTimeout(() => setShutterPressed(false), 200);
       triggerCapture();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
       if (e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown') {
          e.preventDefault();
          handleVolumeTrigger();
       }
    };
    window.addEventListener('keydown', handleKeyDown);
    (window as any).onNativeVolumePress = () => handleVolumeTrigger();
    return () => {
       window.removeEventListener('keydown', handleKeyDown);
       delete (window as any).onNativeVolumePress;
    };
  }, [mode, isRecording]); // Trigger capture uses current closure variables, ensure isRecording is fresh

  const loadGallery = async () => {
    try {
      const items = await dbGetAll();
      setGallery(items.sort((a, b) => b.id - a.id));
    } catch (e) { console.warn("Gallery load failed", e); }
  };

  // --- Feature Handlers ---
  const toggleFlash = async () => {
    const newState = !flashOn;
    setFlashOn(newState);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if ('torch' in capabilities) {
        try { await track.applyConstraints({ advanced: [{ torch: newState } as any] }); } catch (e) {}
      }
    }
  };

  const handleFocus = async (e: React.MouseEvent | React.TouchEvent) => {
     // Guards: ignore buttons and drags
     if ((e.target as HTMLElement).closest('button') || isDragging) return;
     
     // Pinch logic
     if ('touches' in e && e.touches.length === 2) {
       const dist = Math.hypot(
         e.touches[0].clientX - e.touches[1].clientX,
         e.touches[0].clientY - e.touches[1].clientY
       );
       if (pinchDist === null) {
         setPinchDist(dist);
       } else {
         const delta = dist - pinchDist;
         if (Math.abs(delta) > 10) {
            const step = delta > 0 ? 0.1 : -0.1;
            const newZoom = Math.max(1, Math.min(10, zoom + step));
            setZoom(newZoom);
            applyZoom(newZoom);
            setPinchDist(dist);
         }
       }
       return;
     } else {
       setPinchDist(null);
     }

     const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
     const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
     const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
     
     // Normalize coordinates
     const x = (clientX - rect.left) / rect.width;
     const y = (clientY - rect.top) / rect.height;

     setFocusPoint({ x: clientX, y: clientY, visible: true });
     setTimeout(() => setFocusPoint(null), 800);

     const track = streamRef.current?.getVideoTracks()[0];
     if (track) {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        
        try {
           // Attempt advanced focus controls (Android/Chrome mainly)
           const constraints: any = { advanced: [] };
           const advancedSet: any = {};

           // Try Points of Interest
           // @ts-ignore
           if (capabilities.pointsOfInterest || capabilities.focusMode) {
              advancedSet.pointsOfInterest = [{ x, y }];
              advancedSet.focusMode = 'continuous'; // Trigger refocus
              advancedSet.exposureMode = 'continuous'; 
              advancedSet.whiteBalanceMode = 'continuous';
           }

           if (Object.keys(advancedSet).length > 0) {
              constraints.advanced.push(advancedSet);
              await track.applyConstraints(constraints);
           }
        } catch(e) {
           console.debug("Focus constraints failed, ignoring", e);
        }
     }
  };

  // --- ROBUST VIDEO RECORDING START/STOP ---
  
  const startVideoRecording = async (): Promise<boolean> => {
    // Guards
    if (!streamRef.current || isRecording || isStartingRef.current) return false;
    
    isStartingRef.current = true;
    setIsProcessing(true); // Disable UI interactions

    return new Promise((resolve) => {
      try {
        const mimeTypes = [
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm"
        ];
        let selectedMime = "";
        for (const mime of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mime)) {
            selectedMime = mime;
            break;
          }
        }

        if (!selectedMime && !MediaRecorder.isTypeSupported("video/webm")) {
          showToast("MediaRecorder not supported");
          isStartingRef.current = false;
          setIsProcessing(false);
          resolve(false);
          return;
        }

        recordedChunksRef.current = [];
        const options = selectedMime ? { mimeType: selectedMime } : undefined;
        const mr = new MediaRecorder(streamRef.current, options);
        
        mr.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mr.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          showToast("Recording error");
          if (isStartingRef.current) {
             isStartingRef.current = false;
             setIsProcessing(false);
             resolve(false);
          }
        };

        mr.onstart = () => {
          console.debug("MediaRecorder started");
          setIsRecording(true); // Correct place to set state
          isStartingRef.current = false;
          setIsProcessing(false);
          showToast("Recording started");
          resolve(true);
        };

        // Safety timeout if onstart never fires
        setTimeout(() => {
          if (isStartingRef.current) {
            console.warn("MediaRecorder start timeout");
            isStartingRef.current = false;
            setIsProcessing(false);
            if (mr.state !== 'inactive') mr.stop();
            mediaRecorderRef.current = null;
            showToast("Recording failed to start");
            resolve(false);
          }
        }, 2500);

        mediaRecorderRef.current = mr;
        mr.start(1000); 

      } catch (e) {
        console.error("Failed to start recording", e);
        showToast("Unable to start recording");
        isStartingRef.current = false;
        setIsProcessing(false);
        resolve(false);
      }
    });
  };

  const stopVideoRecording = async (): Promise<void> => {
    // Guards: Check if already stopping
    if (isStoppingRef.current) return;
    
    isStoppingRef.current = true;
    setIsProcessing(true); // Disable UI interactions

    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      
      const handleStop = async () => {
        console.debug("Recorder stopped, processing...");
        try {
          const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
          if (blob.size > 0) {
             await dbAdd({ 
               type: "video", 
               blob, 
               createdAt: Date.now(), 
               meta: { facingMode } 
             });
             await loadGallery();
             showToast("Recording saved");
          } else {
             console.warn("Empty blob, skipping save");
             showToast("Recording empty");
          }
        } catch (err) {
          console.error("Save failed", err);
          showToast("Failed to save video");
        }
        
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setIsProcessing(false);
        isStoppingRef.current = false;
        resolve();
      };

      if (!mr) {
        // Should not happen if isRecording was true, but safety fallback
        handleStop();
        return;
      }

      // If already inactive, just save
      if (mr.state === "inactive") {
        handleStop();
        return;
      }

      // Setup timeout/listeners
      const timeoutId = setTimeout(() => {
        console.warn("Recording stop timeout forced");
        if (mr) mr.onstop = null; 
        handleStop(); 
      }, 4000);

      mr.onstop = () => {
        clearTimeout(timeoutId);
        handleStop();
      };
      
      try {
        mr.stop();
      } catch (e) {
        console.error("Error stopping recorder:", e);
        clearTimeout(timeoutId);
        handleStop(); 
      }
    });
  };

  // --- UNIFIED CAPTURE HANDLER ---
  const triggerCapture = async () => {
    // Transient guards against duplicate clicks
    if (isStartingRef.current || isStoppingRef.current || isProcessing) return;

    // Timer logic (only if not recording)
    if (timer > 0 && !isRecording) {
      for (let i = timer; i > 0; i--) {
        setCountdown(i);
        await new Promise(r => setTimeout(r, 1000));
      }
      setCountdown(null);
      // Re-check guards after timer delay
      if (isStartingRef.current || isStoppingRef.current) return;
    }
    
    if (mode === 'video') {
       if (!isRecording) {
         await startVideoRecording();
       } else {
         await stopVideoRecording();
       }
    } else {
       takePhoto();
    }
  };

  const takePhoto = async () => {
    setShowFlashOverlay(true);
    setTimeout(() => setShowFlashOverlay(false), 250);

    let liveBlob: Blob | null = null;
    if (liveEnabled && window.MediaRecorder && streamRef.current) {
      try {
        const mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
        const chunks: BlobPart[] = [];
        mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        mr.start();
        await new Promise(r => setTimeout(r, 1500)); 
        mr.stop();
        await new Promise(r => { mr.onstop = r; });
        liveBlob = new Blob(chunks, { type: 'video/webm' });
      } catch (e) {}
    }

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      let sx = 0, sy = 0, sWidth = width, sHeight = height;
      
      if (aspect === '1:1') {
        const min = Math.min(width, height);
        sx = (width - min) / 2; sy = (height - min) / 2; sWidth = min; sHeight = min;
      } else if (aspect === '4:3') {
        if (width > height) {
            const targetWidth = height * (4/3);
            if (width > targetWidth) { sx = (width - targetWidth) / 2; sWidth = targetWidth; } 
            else { const targetHeight = width * (3/4); sy = (height - targetHeight) / 2; sHeight = targetHeight; }
        } else {
            const targetHeight = width * (4/3);
            if (height > targetHeight) { sy = (height - targetHeight) / 2; sHeight = targetHeight; } 
            else { const targetWidth = height * (3/4); sx = (width - targetWidth) / 2; sWidth = targetWidth; }
        }
      }

      canvas.width = sWidth;
      canvas.height = sHeight;
      const currentFilter = STYLES[styleIndex].filter;
      const nightFilter = nightMode ? 'brightness(1.3) contrast(1.1) saturate(0.8)' : '';
      ctx.filter = `${currentFilter} ${nightFilter}`.trim();
      ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

      canvas.toBlob(async (blob) => {
        if (blob) {
          await dbAdd({
            type: 'photo', blob, liveBlob, createdAt: Date.now(),
            meta: { style: STYLES[styleIndex].name, aspect, nightMode }
          });
          loadGallery();
        }
      }, 'image/jpeg', 0.95);
    }
  };

  // --- Drag Logic ---
  const handleTouchStart = () => setIsDragging(true);
  const handleTouchMove = (e: React.TouchEvent) => {
     if (!capsuleRef.current) return;
     const rect = capsuleRef.current.getBoundingClientRect();
     const touchX = e.touches[0].clientX;
     const localX = touchX - rect.left;
     const itemWidth = rect.width / 2;
     let val = localX - (itemWidth / 2);
     val = Math.max(0, Math.min(itemWidth, val));
     requestAnimationFrame(() => {
        if (capsuleRef.current) capsuleRef.current.style.setProperty('--highlight-x', `${val}px`);
     });
  };
  const handleTouchEnd = () => {
     setIsDragging(false);
     if (!capsuleRef.current) return;
     const rect = capsuleRef.current.getBoundingClientRect();
     const currentX = parseFloat(capsuleRef.current.style.getPropertyValue('--highlight-x') || '0');
     const segment = rect.width / 2;
     const index = Math.round(currentX / segment);
     const safeIndex = Math.max(0, Math.min(1, index));
     setMode(MODES[safeIndex]);
     capsuleRef.current.style.removeProperty('--highlight-x');
  };

  const switchCamera = () => {
    setIsSwitching(true);
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    setTimeout(() => setIsSwitching(false), 500);
  };

  const handleGrantPermissions = async () => {
    if (Capacitor.isNativePlatform()) {
      await requestAndroidPermissions();
      // Explicitly try to trigger Mic prompt if it wasn't covered
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        console.warn("Microphone trigger check failed", err);
      }
    }
    setHasPermission(null);
    startCamera();
  };

  if (hasPermission === false) {
    return (
      <div className="w-full h-full bg-black flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in duration-500">
        <div className="w-24 h-24 rounded-full bg-gray-900 border border-white/10 flex items-center justify-center mb-2 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
           <Lock size={40} className="text-gray-400" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Permissions Needed</h2>
          <p className="text-gray-400 text-sm max-w-[260px] mx-auto leading-relaxed">
            Please allow access to use the professional camera features.
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-[280px]">
           <div className="flex items-center gap-4 text-left p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
              <Camera size={20} className="text-iosYellow shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">Camera</div>
                <div className="text-xs text-gray-500">For capturing photos & video</div>
              </div>
           </div>
           <div className="flex items-center gap-4 text-left p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
              <Mic size={20} className="text-iosYellow shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">Microphone</div>
                <div className="text-xs text-gray-500">For recording audio</div>
              </div>
           </div>
           <div className="flex items-center gap-4 text-left p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
              <Folder size={20} className="text-iosYellow shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">Files & Media</div>
                <div className="text-xs text-gray-500">For saving to gallery</div>
              </div>
           </div>
        </div>

        <button 
          onClick={handleGrantPermissions}
          className="bg-iosYellow text-black font-bold text-base px-10 py-4 rounded-full active:scale-95 transition-all shadow-[0_4px_20px_rgba(255,214,10,0.3)] hover:shadow-[0_4px_25px_rgba(255,214,10,0.4)]"
        >
          Grant Permissions
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-start overflow-hidden select-none">
      
      {/* 1. Preview */}
      <div 
        className={`transition-all duration-300 ease-in-out w-full h-full absolute inset-0 ${aspect !== 'full' && 'scale-90 rounded-2xl'}`}
        onTouchStart={handleFocus}
        // Removed onTouchMove to prevent continuous focus firing
        onTouchEnd={() => setPinchDist(null)}
        onClick={handleFocus}
      >
         <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover"
            style={{ 
               filter: `${STYLES[styleIndex].filter} ${nightMode ? 'brightness(1.2)' : ''}` 
            }}
         />
         {focusPoint?.visible && <div className="focus-ring" style={{ left: focusPoint.x, top: focusPoint.y }} />}
         {showFlashOverlay && <div className="absolute inset-0 bg-white animate-flash pointer-events-none z-50"/>}
         {countdown !== null && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50"><span className="text-9xl text-white font-bold">{countdown}</span></div>}
      </div>

      {/* 2. Top Right Settings Button */}
      <button 
        className="top-settings-btn glass-base"
        onClick={() => setShowSettings(!showSettings)}
      >
         {showSettings ? <ChevronUp size={24}/> : <Settings size={22}/>}
      </button>

      {/* 3. Large iOS Settings Panel (Grid) */}
      {showSettings && (
        <>
        <div className="fixed inset-0 z-50" onClick={() => setShowSettings(false)} />
        <div className="ios-settings-panel glass-base">
           <div className="settings-grid">
               {/* Items with staggered delay via style */}
               <div className={`settings-item ${flashOn ? 'active' : ''}`} onClick={toggleFlash} style={{ animationDelay: '0ms' }}>
                   <div className="settings-icon-circle">{flashOn ? <Zap size={22} fill="currentColor"/> : <ZapOff size={22}/>}</div>
                   <span className="settings-label">FLASH</span>
               </div>
               
               <div className={`settings-item ${liveEnabled ? 'active' : ''}`} onClick={() => setLiveEnabled(!liveEnabled)} style={{ animationDelay: '40ms' }}>
                   <div className="settings-icon-circle"><Aperture size={22} className={liveEnabled ? 'animate-spin-slow' : ''}/></div>
                   <span className="settings-label">LIVE</span>
               </div>

               <div className={`settings-item ${timer > 0 ? 'active' : ''}`} onClick={() => setTimer(t => t === 0 ? 3 : t === 3 ? 10 : 0)} style={{ animationDelay: '80ms' }}>
                   <div className="settings-icon-circle">
                       <div className="relative"><Timer size={22}/>{timer > 0 && <span className="absolute -top-1 -right-1 text-[8px] bg-white text-black rounded-full w-3 h-3 flex items-center justify-center font-bold">{timer}</span>}</div>
                   </div>
                   <span className="settings-label">TIMER</span>
               </div>

               <div className="settings-item" style={{ animationDelay: '120ms' }}>
                   <div className="settings-icon-circle"><Sun size={22}/></div>
                   <span className="settings-label">EXPOSURE</span>
               </div>

               <div className={`settings-item ${styleIndex > 0 ? 'active' : ''}`} onClick={() => setStyleIndex(i => (i+1)%STYLES.length)} style={{ animationDelay: '160ms' }}>
                   <div className="settings-icon-circle"><Sliders size={22}/></div>
                   <span className="settings-label">STYLES</span>
               </div>

               <div className="settings-item" onClick={() => setAspect(a => a === 'full' ? '4:3' : 'full')} style={{ animationDelay: '200ms' }}>
                   <div className="settings-icon-circle"><Ratio size={22}/></div>
                   <span className="settings-label">ASPECT</span>
               </div>
           </div>

           {/* Night Mode */}
           <div className={`settings-item ${nightMode ? 'active' : ''}`} onClick={() => setNightMode(!nightMode)} style={{ animationDelay: '240ms' }}>
               <div className="settings-icon-circle"><Moon size={22} fill={nightMode ? "currentColor" : "none"}/></div>
               <span className="settings-label">NIGHT MODE</span>
           </div>

           {/* Resolution Selector (Video Only) */}
           {mode === 'video' && (
              <div className={`resolution-capsule ${videoRes === '1080p' ? 'res-1080' : 'res-720'}`}>
                  <button onClick={() => setVideoRes('1080p')} className={`res-option ${videoRes === '1080p' ? 'selected' : ''}`}>1080p · 30</button>
                  <button onClick={() => setVideoRes('720p')} className={`res-option ${videoRes === '720p' ? 'selected' : ''}`}>720p · 30</button>
              </div>
           )}
        </div>
        </>
      )}

      {/* 4. Zoom Bar (Floating above Shutter) */}
      <div className="zoom-bar glass-base">
         {ZOOM_LEVELS.map(z => (
            <button 
               key={z} 
               onClick={() => handleZoomSelect(z)}
               className={`zoom-option ${zoom === z ? 'active' : ''}`}
            >
               {z}x
            </button>
         ))}
      </div>

      {/* 5. Shutter Button (Centered independent) */}
      <div className={`shutter-button ${shutterPressed ? 'is-pressed' : ''}`}>
         <button 
           className={`shutter-inner ${isRecording ? 'recording' : mode === 'video' ? 'video-ready' : ''}`}
           disabled={isProcessing}
           onPointerDown={() => setShutterPressed(true)}
           onPointerUp={() => setShutterPressed(false)}
           onPointerLeave={() => setShutterPressed(false)}
           onClick={triggerCapture}
         />
      </div>

      {/* 6. Bottom Row: Gallery | Mode | Switch */}
      <div className="bottom-controls-row">
         {/* Left: Gallery */}
         <button 
            onClick={() => setShowGallery(true)}
            className="gallery-circle glass-base"
         >
            {gallery.length > 0 ? (
                gallery[0].type === 'video' ? 
                <div className="w-full h-full bg-gray-900 flex items-center justify-center"><Video size={18} className="text-white/80"/></div> :
                <img src={URL.createObjectURL(gallery[0].blob)} className="w-full h-full object-cover" />
            ) : <div className="w-full h-full bg-gray-900 flex items-center justify-center"><ImageIcon size={18} className="text-white/30"/></div>}
         </button>

         {/* Center: Mode Capsule */}
         <div 
            ref={capsuleRef}
            className={`mode-capsule glass-base ${mode} ${isDragging ? 'dragging' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
         >
            {MODES.map(m => (
               <button 
                  key={m}
                  onClick={(e) => { e.stopPropagation(); setMode(m); }}
                  className={`mode-option ${mode === m ? 'selected' : ''}`}
               >
                  {m.toUpperCase()}
               </button>
            ))}
         </div>

         {/* Right: Switch */}
         <button 
            onClick={switchCamera}
            className={`switch-camera-circle ${isSwitching ? 'rotate' : ''}`}
         >
            <SwitchCamera size={22} />
         </button>
      </div>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-xl px-6 py-3 rounded-2xl text-white font-medium z-[70] pointer-events-none animate-in fade-in zoom-in duration-200">
           {toastMessage}
        </div>
      )}

      {/* Hidden Canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Gallery Modal */}
      {showGallery && (
        <div className="fixed inset-0 z-[60] bg-black animate-in slide-in-from-bottom-10 duration-300 flex flex-col">
          <div className="p-4 pt-12 flex items-center justify-between bg-black/80 backdrop-blur-md sticky top-0 z-10 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">Library</h2>
            <button onClick={() => setShowGallery(false)} className="text-iosYellow font-bold px-2 py-1">Done</button>
          </div>
          <div className="flex-1 overflow-y-auto p-1 grid grid-cols-3 gap-1 content-start">
            {gallery.map(item => (
              <div key={item.id} className="aspect-square bg-gray-900 relative group overflow-hidden">
                {item.type === 'photo' ? (
                  <img src={URL.createObjectURL(item.blob)} className="w-full h-full object-cover" />
                ) : (
                  <video src={URL.createObjectURL(item.blob)} className="w-full h-full object-cover" />
                )}
                {item.liveBlob && <div className="absolute top-1 right-1"><Aperture size={12} className="text-iosYellow" /></div>}
                <a href={URL.createObjectURL(item.blob)} download={`lg-${item.id}`} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center"><ImageIcon className="text-white" size={24} /></a>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}