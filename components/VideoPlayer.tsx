import React from 'react';
import { VideoPlayerProps } from './VideoPlayer/VideoPlayerTypes';
import { TrailerPlayer } from './VideoPlayer/TrailerPlayer';
import { StreamingPlayer } from './VideoPlayer/StreamingPlayer';

const VideoPlayer: React.FC<VideoPlayerProps> = (props) => {
  if (props.isTrailer) {
    return (
      <TrailerPlayer 
        title={props.title} 
        sources={props.sources} 
        onClose={props.onClose} 
        coverImage={props.sources?.[0]?.stream} 
      />
    );
  }
  
  return <StreamingPlayer {...props} />;
};

export default VideoPlayer;
export * from './VideoPlayer/VideoPlayerTypes';
