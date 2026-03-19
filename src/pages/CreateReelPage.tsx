import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Camera, 
  Image as ImageIcon, 
  Music, 
  Type, 
  Sparkles, 
  Scissors, 
  RefreshCw, 
  Circle, 
  Square, 
  Send, 
  Home,
  PlaySquare,
  Search,
  ChevronLeft,
  Check,
  Plus
} from 'lucide-react';
import { MOCK_USER, MOCK_SOUNDS } from '../constants';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function CreateReelPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<'select' | 'record' | 'edit'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSound, setSelectedSound] = useState<any>(null);
  const [isSoundSelectorOpen, setIsSoundSelectorOpen] = useState(false);
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Editing states
  const [overlayText, setOverlayText] = useState('');
  const [filter, setFilter] = useState('none');

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', aspectRatio: 16/9 }, 
        audio: true 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
      setMode('select');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startRecording = () => {
    if (!videoRef.current?.srcObject) return;
    
    const stream = videoRef.current.srcObject as MediaStream;
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setPreview(url);
      setFile(new File([blob], "recorded-reel.webm", { type: 'video/webm' }));
      setMode('edit');
    };

    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 60) {
          stopRecording();
          return 60;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      stopCamera();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setMode('edit');
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    setIsUploading(true);

    try {
      // 1. Ensure bucket exists (attempt to create if missing)
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === 'reels');
      
      if (!bucketExists) {
        await supabase.storage.createBucket('reels', { public: true }).catch(err => {
          console.warn('Auto-bucket creation failed (expected with anon key):', err);
        });
      }

      // 2. Upload to Supabase Storage
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('reels')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error('The "reels" storage bucket was not found in your Supabase project. Please create a public bucket named "reels" in your Supabase Storage dashboard.');
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('reels')
        .getPublicUrl(fileName);

      // 2. Save to our backend
      const response = await fetch('/api/reels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id || MOCK_USER.id,
          url: publicUrl,
          caption,
          soundTitle: selectedSound?.title,
          soundArtist: selectedSound?.artist,
        }),
      });

      if (!response.ok) throw new Error('Failed to save reel to database');

      setIsUploading(false);
      alert("Reel shared successfully!");
      navigate('/reels');
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Error uploading reel: ${error.message}. Make sure you have a 'reels' bucket in Supabase Storage.`);
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (mode === 'record') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mode]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-14 sm:h-16 border-b border-white/10 flex items-center justify-between px-4 bg-black/50 backdrop-blur-md z-20">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h3 className="text-white font-bold text-sm">
          {mode === 'select' ? 'Create Reel' : mode === 'record' ? 'Recording' : 'Edit Reel'}
        </h3>
        <div className="w-10" /> {/* Spacer */}
      </div>

      <div className="flex-1 relative flex flex-col overflow-y-auto no-scrollbar">
        {mode === 'select' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-32 h-32 bg-indigo-600/20 rounded-full flex items-center justify-center"
            >
              <PlaySquare size={64} className="text-indigo-500" />
            </motion.div>
            
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-white">Share Your Story</h2>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Create high-quality short videos with music, effects, and more.
              </p>
            </div>
            
            <div className="w-full max-w-sm space-y-4">
              <button 
                onClick={() => setMode('record')}
                className="w-full bg-white text-black py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-gray-100 transition-all shadow-xl active:scale-95"
              >
                <Camera size={20} />
                Record Video
              </button>
              
              <label className="w-full bg-gray-800 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-gray-700 transition-all cursor-pointer active:scale-95">
                <ImageIcon size={20} />
                Upload from Gallery
                <input type="file" className="hidden" accept="video/*" onChange={handleFileChange} />
              </label>
            </div>

            <div className="mt-8 flex items-center gap-4 text-gray-500">
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
                  <Music size={18} />
                </div>
                <span className="text-[10px] font-bold">Music</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
                <span className="text-[10px] font-bold">Effects</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
                  <Scissors size={18} />
                </div>
                <span className="text-[10px] font-bold">Edit</span>
              </div>
            </div>
          </div>
        )}

        {mode === 'record' && (
          <div className="flex-1 relative bg-black flex flex-col">
            <video 
              ref={videoRef}
              autoPlay 
              muted 
              playsInline
              className="w-full h-full object-cover"
            />
            
            {/* Recording UI Overlay */}
            <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none">
              <div className="flex justify-center">
                {isRecording && (
                  <div className="bg-red-600 text-white px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-2 animate-pulse shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full" />
                    {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between pointer-events-auto">
                <button className="p-4 bg-black/40 text-white rounded-full backdrop-blur-md hover:bg-black/60 transition-colors">
                  <RefreshCw size={28} />
                </button>
                
                <button 
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "w-24 h-24 rounded-full border-8 flex items-center justify-center transition-all shadow-2xl",
                    isRecording ? "border-white bg-white/20 scale-110" : "border-white bg-red-600 hover:scale-105"
                  )}
                >
                  {isRecording ? (
                    <Square size={36} className="text-white fill-white" />
                  ) : (
                    <Circle size={40} className="text-white fill-white" />
                  )}
                </button>
                
                <button 
                  onClick={() => setMode('select')}
                  className="p-4 bg-black/40 text-white rounded-full backdrop-blur-md hover:bg-black/60 transition-colors"
                >
                  <X size={28} />
                </button>
              </div>
            </div>

            {/* Side Tools */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-6">
              <ToolButton icon={<Music size={24} />} label="Music" />
              <ToolButton icon={<Sparkles size={24} />} label="Effects" />
              <ToolButton icon={<RefreshCw size={24} />} label="Flip" />
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <div className="flex-1 flex flex-col p-4 sm:p-6 gap-6">
            <div className="relative aspect-[9/16] bg-black overflow-hidden rounded-3xl border border-white/10 shadow-2xl max-w-sm mx-auto w-full group">
              <video 
                src={preview!} 
                className={cn("w-full h-full object-cover", filter !== 'none' && `filter-${filter}`)} 
                autoPlay 
                muted 
                loop 
              />
              
              {/* Overlay Text Preview */}
              {overlayText && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <motion.span 
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white text-black px-6 py-3 rounded-xl font-black text-2xl shadow-2xl"
                  >
                    {overlayText}
                  </motion.span>
                </div>
              )}

              <div className="absolute right-4 top-4 flex flex-col gap-4">
                <button className="p-3 bg-black/40 text-white rounded-full backdrop-blur-md hover:bg-black/60 transition-colors">
                  <Type size={22} />
                </button>
                <button className="p-3 bg-black/40 text-white rounded-full backdrop-blur-md hover:bg-black/60 transition-colors">
                  <Sparkles size={22} />
                </button>
                <button className="p-3 bg-black/40 text-white rounded-full backdrop-blur-md hover:bg-black/60 transition-colors">
                  <Scissors size={22} />
                </button>
              </div>
            </div>

            <div className="max-w-sm mx-auto w-full space-y-6 pb-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Overlay Text</label>
                <input 
                  type="text" 
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  placeholder="Add text to your video..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Sound</label>
                <button 
                  onClick={() => setIsSoundSelectorOpen(true)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-all active:scale-[0.98]"
                >
                  {selectedSound ? (
                    <div className="flex items-center gap-3">
                      <img src={selectedSound.cover} alt="" className="w-10 h-10 rounded-xl object-cover" />
                      <div className="text-left">
                        <p className="text-white text-sm font-bold">{selectedSound.title}</p>
                        <p className="text-gray-500 text-xs">{selectedSound.artist}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-gray-400">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <Music size={20} />
                      </div>
                      <span className="text-sm">Add sound</span>
                    </div>
                  )}
                  <Plus size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Caption</label>
                <textarea 
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none resize-none h-24"
                />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => { setFile(null); setPreview(null); setMode('select'); }}
                  className="flex-1 bg-gray-800 text-white py-4 rounded-2xl font-bold hover:bg-gray-700 transition-all active:scale-95"
                >
                  Discard
                </button>
                <button 
                  disabled={isUploading}
                  onClick={handleSubmit}
                  className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  {isUploading ? (
                    <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={20} />
                      Share Reel
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isSoundSelectorOpen && (
          <SoundSelector 
            onClose={() => setIsSoundSelectorOpen(false)}
            onSelect={(sound) => {
              setSelectedSound(sound);
              setIsSoundSelectorOpen(false);
            }}
            selectedSoundId={selectedSound?.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex flex-col items-center gap-1 group">
      <div className="p-3 bg-black/40 text-white rounded-full backdrop-blur-md group-hover:bg-black/60 transition-colors">
        {icon}
      </div>
      <span className="text-[10px] font-bold text-white drop-shadow-md">{label}</span>
    </button>
  );
}

function SoundSelector({ onClose, onSelect, selectedSoundId }: { onClose: () => void; onSelect: (sound: any) => void; selectedSoundId?: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingSoundId, setPreviewingSoundId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredSounds = MOCK_SOUNDS.filter(s => 
    (s.title || '').toLowerCase().includes((searchQuery || '').toLowerCase()) || 
    (s.artist || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  const togglePreview = (e: React.MouseEvent, sound: any) => {
    e.stopPropagation();
    if (previewingSoundId === sound.id) {
      audioRef.current?.pause();
      setPreviewingSoundId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = sound.audioUrl;
        audioRef.current.play();
      } else {
        audioRef.current = new Audio(sound.audioUrl);
        audioRef.current.play();
      }
      setPreviewingSoundId(sound.id);
      audioRef.current.onended = () => setPreviewingSoundId(null);
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute inset-0 z-[110] bg-gray-950 flex flex-col"
    >
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gray-950/50 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h3 className="text-white font-bold text-sm">Select Sound</h3>
        <div className="w-10" />
      </div>

      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sounds..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {filteredSounds.map((sound) => (
          <div 
            key={sound.id}
            onClick={() => onSelect(sound)}
            className={cn(
              "w-full flex items-center gap-4 p-3 rounded-2xl transition-all border cursor-pointer group",
              selectedSoundId === sound.id 
                ? "bg-indigo-600/20 border-indigo-500" 
                : "bg-white/5 border-transparent hover:bg-white/10"
            )}
          >
            <div className="relative" onClick={(e) => togglePreview(e, sound)}>
              <img src={sound.cover} alt="" className="w-14 h-14 rounded-xl object-cover" />
              <div className={cn(
                "absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center transition-opacity",
                previewingSoundId === sound.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                {previewingSoundId === sound.id ? (
                  <div className="flex gap-0.5 items-end h-5">
                    <motion.div animate={{ height: [4, 16, 6, 12, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-1 bg-white" />
                    <motion.div animate={{ height: [10, 4, 16, 8, 10] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1 bg-white" />
                    <motion.div animate={{ height: [16, 8, 12, 4, 16] }} transition={{ repeat: Infinity, duration: 0.4 }} className="w-1 bg-white" />
                  </div>
                ) : (
                  <PlaySquare size={24} className="text-white" />
                )}
              </div>
            </div>
            <div className="flex-1 text-left">
              <h4 className="text-white font-bold text-sm">{sound.title}</h4>
              <p className="text-gray-500 text-xs">{sound.artist}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-gray-500 text-[10px] font-mono">{sound.duration}</span>
              {selectedSoundId === sound.id && (
                <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
