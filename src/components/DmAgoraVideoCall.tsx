import React, { useEffect, useMemo, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import {
  AgoraRTCProvider,
  LocalUser,
  RemoteUser,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
} from 'agora-rtc-react';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { cn } from '../lib/utils';

type DmAgoraVideoCallProps = {
  appId: string;
  channelName: string;
  uid: number | string;
  onLeave: () => void;
};

function DmAgoraVideoCallInner({ appId, channelName, uid, onLeave }: DmAgoraVideoCallProps) {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);

  const joinReady = Boolean(
    appId && channelName && (typeof uid === 'number' ? Number.isFinite(uid) : String(uid).length > 0)
  );

  useJoin(
    {
      appid: appId,
      channel: channelName,
      token: null,
      uid,
    },
    joinReady
  );

  // iOS Safari: inline playback for Agora-injected <video> nodes.
  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    const apply = () => {
      root.querySelectorAll('video').forEach((v) => {
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
      });
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();

  return (
    <div className="flex h-full flex-col">
      <div
        ref={gridRef}
        className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 sm:grid-cols-2 sm:gap-4 sm:p-4"
      >
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gray-900 sm:rounded-3xl">
          <LocalUser
            audioTrack={localMicrophoneTrack}
            cameraTrack={localCameraTrack}
            playAudio={false}
            micOn={micOn}
            cameraOn={cameraOn}
            className="h-full min-h-[180px] w-full"
          />
          <div className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md sm:bottom-4 sm:left-4 sm:px-3 sm:py-1 sm:text-xs">
            You
          </div>
        </div>

        {remoteUsers.length > 0 ? (
          remoteUsers.map((remoteUser) => (
            <div key={String(remoteUser.uid)} className="relative overflow-hidden rounded-xl border border-indigo-500/60 bg-gray-900 sm:rounded-3xl">
              <RemoteUser user={remoteUser} className="h-full min-h-[180px] w-full" />
              <div className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md sm:bottom-4 sm:left-4 sm:px-3 sm:py-1 sm:text-xs">
                {String(remoteUser.uid)}
              </div>
            </div>
          ))
        ) : (
          <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-white/10 bg-gray-900 sm:rounded-3xl">
            <span className="text-xs text-gray-300 sm:text-sm">Waiting for other user camera...</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-3 sm:gap-6 sm:p-8">
        <button
          onClick={() => setMicOn((v) => !v)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition-all sm:h-14 sm:w-14',
            micOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white'
          )}
        >
          {micOn ? <Mic size={16} className="sm:size-[24px]" /> : <MicOff size={16} className="sm:size-[24px]" />}
        </button>
        <button
          onClick={() => setCameraOn((v) => !v)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition-all sm:h-14 sm:w-14',
            cameraOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white'
          )}
        >
          {cameraOn ? <Video size={16} className="sm:size-[24px]" /> : <VideoOff size={16} className="sm:size-[24px]" />}
        </button>
        <button
          onClick={onLeave}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/40 transition-all hover:scale-110 hover:bg-red-700 sm:h-16 sm:w-16"
        >
          <PhoneOff size={20} className="sm:size-[32px]" />
        </button>
      </div>
    </div>
  );
}

export default function DmAgoraVideoCall(props: DmAgoraVideoCallProps) {
  const client = useMemo(() => AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' }), []);
  if (!props.appId?.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-sm text-amber-200/90">
          Video calls are not configured: set <code className="rounded bg-white/10 px-1">VITE_AGORA_APP_ID</code> in the
          environment and redeploy (Vercel → Project → Settings → Environment Variables).
        </p>
        <button
          type="button"
          onClick={props.onLeave}
          className="rounded-full bg-red-600 px-6 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          End call
        </button>
      </div>
    );
  }
  return (
    <AgoraRTCProvider client={client}>
      <DmAgoraVideoCallInner {...props} />
    </AgoraRTCProvider>
  );
}
