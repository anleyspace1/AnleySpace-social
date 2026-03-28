import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC, { 
  IAgoraRTCClient, 
  ICameraVideoTrack, 
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser
} from "agora-rtc-sdk-ng";
import { Video, VideoOff, Mic, MicOff, PhoneOff, User } from 'lucide-react';
import { cn } from '../lib/utils';

/** Production (e.g. Vercel): set `VITE_AGORA_APP_ID` in the project env; never commit the real value. */
const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

interface AgoraCallProps {
  /** Optional fallback if `VITE_AGORA_APP_ID` is unset (e.g. tests); join prefers env `APP_ID`. */
  appId?: string;
  channelName: string;
  token?: string | null;
  uid: string | number;
  role: "host" | "audience";
  type: "audio" | "video";
  onLeave: () => void;
}

export default function AgoraCall({ appId, channelName, uid, role, type, onLeave }: AgoraCallProps) {
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(type === 'audio');
  
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const audioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const videoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const localVideoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      clientRef.current = AgoraRTC.createClient({ mode: role === 'host' ? "rtc" : "live", codec: "vp8" });
      
      if (role === 'audience') {
        clientRef.current.setClientRole('audience');
      } else {
        clientRef.current.setClientRole('host');
      }

      clientRef.current.on("user-published", async (user, mediaType) => {
        await clientRef.current?.subscribe(user, mediaType);
        if (mediaType === "video") {
          setRemoteUsers(prev => [...prev.filter(u => u.uid !== user.uid), user]);
        }
        if (mediaType === "audio") {
          user.audioTrack?.play();
        }
      });

      clientRef.current.on("user-unpublished", (user) => {
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });

      clientRef.current.on("user-left", (user) => {
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });

      try {
        const resolvedAppId = APP_ID ?? appId ?? '';
        console.log('AGORA APP_ID:', APP_ID);
        console.log('JOIN UID:', uid);

        await clientRef.current.join(resolvedAppId, channelName, null, uid);
        
        if (role === 'host') {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          audioTrackRef.current = audioTrack;
          setLocalAudioTrack(audioTrack);
          
          if (type === 'video') {
            const videoTrack = await AgoraRTC.createCameraVideoTrack();
            videoTrackRef.current = videoTrack;
            setLocalVideoTrack(videoTrack);
            videoTrack.play(localVideoRef.current!);
            await clientRef.current.publish([audioTrack, videoTrack]);
          } else {
            await clientRef.current.publish([audioTrack]);
          }
        }
      } catch (err) {
        console.error("Agora join error:", err);
      }
    };

    init();

    return () => {
      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
        audioTrackRef.current.close();
        audioTrackRef.current = null;
      }
      if (videoTrackRef.current) {
        videoTrackRef.current.stop();
        videoTrackRef.current.close();
        videoTrackRef.current = null;
      }
      clientRef.current?.leave();
    };
  }, [appId, channelName, uid, role, type]);

  const toggleMute = () => {
    if (localAudioTrack) {
      localAudioTrack.setEnabled(isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localVideoTrack) {
      localVideoTrack.setEnabled(isCameraOff);
      setIsCameraOff(!isCameraOff);
    }
  };

  const handleLeave = () => {
    onLeave();
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-900 relative overflow-hidden">
      <div className={cn(
        "flex-1 grid gap-4 p-4",
        remoteUsers.length === 0 ? "grid-cols-1" : 
        remoteUsers.length === 1 ? "grid-cols-1 md:grid-cols-2" :
        "grid-cols-2 md:grid-cols-3"
      )}>
        {/* Local User */}
        {role === 'host' && (
          <div className="relative bg-gray-800 rounded-3xl overflow-hidden border border-white/10 aspect-video">
            <div ref={localVideoRef} id="local-player" className="w-full h-full" />
            {isCameraOff && (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                <User size={64} className="text-gray-700" />
              </div>
            )}
            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-bold">
              You {isMuted && "(Muted)"}
            </div>
          </div>
        )}

        {/* Remote Users */}
        {remoteUsers.map((user, i) => (
          <div
            key={user.uid}
            id={i === 0 ? 'remote-player' : undefined}
            className="relative bg-gray-800 rounded-3xl overflow-hidden border border-white/10 aspect-video"
          >
            <RemoteVideoPlayer user={user} />
            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-bold">
              User {user.uid}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center items-center gap-6">
        {role === 'host' && (
          <>
            <button 
              onClick={toggleMute}
              className={cn(
                "p-4 rounded-full transition-all",
                isMuted ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
              )}
            >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            {type === 'video' && (
              <button 
                onClick={toggleCamera}
                className={cn(
                  "p-4 rounded-full transition-all",
                  isCameraOff ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {isCameraOff ? <VideoOff size={24} /> : <Video size={24} />}
              </button>
            )}
          </>
        )}
        <button 
          onClick={handleLeave}
          className="p-4 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
        >
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}

function RemoteVideoPlayer({ user }: { user: IAgoraRTCRemoteUser }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user.videoTrack && ref.current) {
      user.videoTrack.play(ref.current);
    }
  }, [user.videoTrack]);

  return <div ref={ref} className="w-full h-full" />;
}
