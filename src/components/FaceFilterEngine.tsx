import React, { useEffect, useRef, useState } from 'react';
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import { Filter } from './CameraFilters';

interface FaceFilterEngineProps {
  stream: MediaStream | null;
  selectedFilter: Filter | undefined;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  isRecording: boolean;
}

export default function FaceFilterEngine({ stream, selectedFilter, onCanvasReady, isRecording }: FaceFilterEngineProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    onCanvasReady(canvasRef.current);
  }, []);

  useEffect(() => {
    const faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      }
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);
    faceMeshRef.current = faceMesh;

    return () => {
      faceMesh.close();
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (stream && videoRef.current && !cameraRef.current) {
      videoRef.current.srcObject = stream;
      
      cameraRef.current = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && faceMeshRef.current) {
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        },
        width: 1280,
        height: 720
      });
      cameraRef.current.start();
      setIsLoaded(true);
    }
  }, [stream]);

  const onResults = (results: Results) => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    const { width, height } = canvasRef.current;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, width, height);
    
    // Draw original video frame
    canvasCtx.drawImage(results.image, 0, 0, width, height);

    if (selectedFilter?.type === 'ai' && results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const config = selectedFilter.aiConfig || {};

      // Apply Beauty Effects
      if (config.smoothing) applySmoothing(canvasCtx, landmarks, width, height, config.smoothing);
      if (config.slimming) applySlimming(canvasCtx, landmarks, width, height, config.slimming);
      if (config.eyes) applyEyeEnhancement(canvasCtx, landmarks, width, height, config.eyes);
      if (config.lighting) applyLighting(canvasCtx, width, height, config.lighting);
    }

    canvasCtx.restore();
  };

  const applySmoothing = (ctx: CanvasRenderingContext2D, landmarks: any, width: number, height: number, intensity: number) => {
    // Simplified smoothing: apply a slight blur to the face area
    ctx.save();
    ctx.beginPath();
    // Use face oval landmarks for clipping
    const faceOval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    
    faceOval.forEach((idx, i) => {
      const point = landmarks[idx];
      if (i === 0) ctx.moveTo(point.x * width, point.y * height);
      else ctx.lineTo(point.x * width, point.y * height);
    });
    ctx.closePath();
    ctx.clip();

    // Apply blur
    ctx.filter = `blur(${intensity * 4}px) saturate(1.1)`;
    ctx.globalAlpha = intensity * 0.5;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
  };

  const applySlimming = (ctx: CanvasRenderingContext2D, landmarks: any, width: number, height: number, intensity: number) => {
    // Simplified slimming: slightly scale the face width-wise towards the center
    // This is a very basic approximation
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const centerX = (leftCheek.x + rightCheek.x) / 2 * width;
    
    // We would ideally use a mesh warp here, but for now we'll just do a subtle overlay
    // or skip if it's too complex for 2D canvas without artifacts.
    // Let's try a subtle lighting trick that mimics slimming (contouring)
    ctx.save();
    const gradient = ctx.createRadialGradient(centerX, height/2, width*0.1, centerX, height/2, width*0.4);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, `rgba(0,0,0,${intensity * 0.3})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  const applyEyeEnhancement = (ctx: CanvasRenderingContext2D, landmarks: any, width: number, height: number, intensity: number) => {
    const leftEye = landmarks[159];
    const rightEye = landmarks[386];

    [leftEye, rightEye].forEach(eye => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(eye.x * width, eye.y * height, 20 * intensity, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${intensity * 0.2})`;
      ctx.filter = 'blur(5px)';
      ctx.fill();
      ctx.restore();
    });
  };

  const applyLighting = (ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number) => {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = `rgba(255,255,255,${intensity * 0.2})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas 
        ref={canvasRef} 
        width={720} 
        height={1280} 
        className="h-full w-full object-cover"
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white font-bold text-sm animate-pulse">Initializing AI Filters...</p>
        </div>
      )}
    </div>
  );
}
