import React from 'react';
interface LoaderProps {
    type?: 'rect' | 'triangle' | 'circle';
    inline?: boolean;
}
const Loader: React.FC<LoaderProps> = ({ type = 'rect', inline = false }) => {
  return (
    <div className={`flex items-center justify-center ${inline ? 'p-2' : 'p-20'}`}>
      <div className={`loader ${type}`}>
        <svg viewBox="0 0 80 80">
          {type === 'rect' && <rect x="8" y="8" width="64" height="64"></rect>}
          {type === 'triangle' && <polygon points="40,8 72,64 8,64"></polygon>}
          {type === 'circle' && <circle cx="40" cy="40" r="32"></circle>}
        </svg>
      </div>
    </div>
  );
};
export default Loader;