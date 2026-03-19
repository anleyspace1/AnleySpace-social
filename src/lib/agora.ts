import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";

const APP_ID = import.meta.env.VITE_AGORA_APP_ID || "";

export const client: IAgoraRTCClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export const joinChannel = async (channelName: string, uid: string | number | null, role: "host" | "audience" = "host") => {
  if (!APP_ID) {
    console.error("Agora App ID is missing");
    return;
  }
  
  await client.join(APP_ID, channelName, null, uid);
  
  if (role === "host") {
    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    await client.publish([audioTrack, videoTrack]);
    return { audioTrack, videoTrack };
  }
};

export const leaveChannel = async (audioTrack?: IMicrophoneAudioTrack, videoTrack?: ICameraVideoTrack) => {
  if (audioTrack) {
    audioTrack.stop();
    audioTrack.close();
  }
  if (videoTrack) {
    videoTrack.stop();
    videoTrack.close();
  }
  await client.leave();
};
