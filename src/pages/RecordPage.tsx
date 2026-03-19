import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Camera, 
  RotateCcw, 
  Zap, 
  Music, 
  Sparkles, 
  Check, 
  ChevronLeft,
  Settings,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Clock,
  Scissors
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import CameraFilters, { CAMERA_FILTERS, Filter } from '../components/CameraFilters';
import FaceFilterEngine from '../components/FaceFilterEngine';

export default function RecordPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [selectedFilterId, setSelectedFilterId] = useState('none');
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [recordingComplete, setRecordingComplete] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const selectedFilter = CAMERA_FILTERS.find(f => f.id === selectedFilterId);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [cameraFacing]);

  const startCamera = async () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacing, width: 720, height: 1280 },
        audio: true
      });
      setStream(newStream);
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const toggleCamera = () => {
    setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  };

  const startRecording = () => {
    if (!canvasRef.current) return;
    
    setRecordedChunks([]);
    const canvasStream = canvasRef.current.captureStream(30);
    
    // Add audio track if available
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        canvasStream.addTrack(audioTracks[0].clone());
      }
    }

    const mediaRecorder = new MediaRecorder(canvasStream, {
      mimeType: 'video/webm;codecs=vp9'
    });
    
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        setRecordedChunks(prev => [...prev, e.data]);
      }
    };
    mediaRecorder.onstop = () => {
      // Use the chunks collected during recording
    };
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Create blob from chunks
      setTimeout(() => {
        setRecordedChunks(prev => {
          const blob = new Blob(prev, { type: 'video/webm' });
          setVideoUrl(URL.createObjectURL(blob));
          setRecordingComplete(true);
          return prev;
        });
      }, 500);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleNextFilter = () => {
    const currentIndex = CAMERA_FILTERS.findIndex(f => f.id === selectedFilterId);
    const nextIndex = (currentIndex + 1) % CAMERA_FILTERS.length;
    setSelectedFilterId(CAMERA_FILTERS[nextIndex].id);
  };

  const handlePrevFilter = () => {
    const currentIndex = CAMERA_FILTERS.findIndex(f => f.id === selectedFilterId);
    const prevIndex = (currentIndex - 1 + CAMERA_FILTERS.length) % CAMERA_FILTERS.length;
    setSelectedFilterId(CAMERA_FILTERS[prevIndex].id);
  };

  // Swipe detection for filters
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNextFilter();
      else handlePrevFilter();
    }
  };

  if (recordingComplete && videoUrl) {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col">
        <div className="relative flex-1 bg-black flex items-center justify-center">
          <video 
            src={videoUrl} 
            autoPlay 
            loop 
            className={cn(
              "h-full w-full object-cover",
              CAMERA_FILTERS.find(f => f.id === selectedFilterId)?.class
            )} 
          />
          <button 
            onClick={() => setRecordingComplete(false)}
            className="absolute top-6 left-6 p-3 bg-black/40 backdrop-blur-md rounded-full text-white"
          >
            <ChevronLeft size={24} />
          </button>
        </div>
        <div className="p-6 bg-black border-t border-white/10 flex items-center justify-between gap-4">
          <button 
            onClick={() => setRecordingComplete(false)}
            className="flex-1 py-4 rounded-2xl bg-white/10 text-white font-bold flex items-center justify-center gap-2"
          >
            <RotateCcw size={20} />
            Retake
          </button>
          <button 
            onClick={() => navigate('/reels')}
            className="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            <Check size={20} />
            Post Reel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col overflow-hidden">
      {/* Camera View */}
      <div 
        className="relative flex-1 bg-gray-900 overflow-hidden flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={cn(
          "h-full w-full transition-all duration-500",
          selectedFilter?.type === 'css' ? selectedFilter.class : ''
        )}>
          <FaceFilterEngine 
            stream={stream}
            selectedFilter={selectedFilter}
            onCanvasReady={(canvas) => canvasRef.current = canvas}
            isRecording={isRecording}
          />
        </div>

        {/* Top Controls */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-20">
          <button 
            onClick={() => navigate(-1)}
            className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"
          >
            <X size={24} />
          </button>
          
          <div className="flex flex-col gap-4">
            <SideButton icon={<RotateCcw size={20} />} label="Flip" onClick={toggleCamera} />
            <SideButton icon={<Zap size={20} />} label="Flash" />
            <SideButton icon={<Clock size={20} />} label="Timer" />
            <SideButton icon={<Scissors size={20} />} label="Trim" />
            <SideButton icon={isMuted ? <MicOff size={20} /> : <Mic size={20} />} label="Mic" onClick={() => setIsMuted(!isMuted)} />
          </div>
        </div>

        {/* Recording Status */}
        {isRecording && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-red-600 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg z-20">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-white font-black text-xs tracking-widest">{formatTime(recordingTime)}</span>
          </div>
        )}

        {/* Filter Name Badge (shows on swipe) */}
        <AnimatePresence mode="wait">
          <motion.div 
            key={selectedFilterId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          >
            <span className="text-white font-black text-4xl uppercase italic tracking-tighter opacity-20">
              {CAMERA_FILTERS.find(f => f.id === selectedFilterId)?.name}
            </span>
          </motion.div>
        </AnimatePresence>

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center">
          {/* Filter Menu */}
          <div className="w-full">
            <CameraFilters 
              selectedFilterId={selectedFilterId}
              onFilterSelect={setSelectedFilterId}
            />
          </div>

          <div className="w-full p-8 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
              <img src="https://picsum.photos/seed/gallery/100/100" alt="" className="w-full h-full object-cover opacity-50" />
            </div>

            {/* Record Button */}
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className="relative group"
            >
              <div className={cn(
                "w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-300",
                isRecording ? "border-white scale-110" : "border-white/40 group-hover:border-white"
              )}>
                <div className={cn(
                  "transition-all duration-300",
                  isRecording 
                    ? "w-8 h-8 bg-red-600 rounded-lg" 
                    : "w-14 h-14 bg-red-600 rounded-full group-hover:scale-90"
                )} />
              </div>
              {isRecording && (
                <svg className="absolute inset-0 -rotate-90 w-20 h-20 pointer-events-none">
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="none"
                    stroke="white"
                    strokeWidth="4"
                    strokeDasharray={226}
                    strokeDashoffset={226 - (226 * (recordingTime / 60))}
                    className="transition-all duration-1000 linear"
                  />
                </svg>
              )}
            </button>

            <button className="flex flex-col items-center gap-1 text-white/60 hover:text-white transition-colors">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <Sparkles size={24} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest">Effects</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SideButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
    >
      <div className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white group-hover:bg-black/60 transition-all">
        {icon}
      </div>
      <span className="text-[8px] font-black text-white uppercase tracking-widest drop-shadow-md">{label}</span>
    </button>
  );
}
