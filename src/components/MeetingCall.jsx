// The meeting's video call. Loaded only when someone joins, so the LiveKit
// libraries never slow down the rest of Groupify.
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

export default function MeetingCall({ connection, onLeave, onError }) {
  return (
    <section className="meeting-call" data-lk-theme="default" aria-label="Video call">
      <LiveKitRoom
        serverUrl={connection.url}
        token={connection.token}
        connect
        audio
        video={false}
        onDisconnected={onLeave}
        onError={onError}
        onMediaDeviceFailure={() => onError?.(new Error('Your camera or microphone could not be used. Check the browser permission.'))}
      >
        <VideoConference />
      </LiveKitRoom>
    </section>
  );
}
