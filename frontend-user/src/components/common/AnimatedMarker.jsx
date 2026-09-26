import { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';

// Utility to interpolate between two coordinates
const interpolate = (start, end, progress) => {
  return start + (end - start) * progress;
};

export default function AnimatedMarker({ position, icon, duration = 3000, children, ...props }) {
  const markerRef = useRef(null);
  const [currentPos, setCurrentPos] = useState(position);
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);
  const startPosRef = useRef(position);
  const endPosRef = useRef(position);

  useEffect(() => {
    // If it's the first mount, just set the position
    if (startPosRef.current[0] === position[0] && startPosRef.current[1] === position[1]) {
      return;
    }

    // Set up new animation targets
    startPosRef.current = currentPos;
    endPosRef.current = position;
    startTimeRef.current = performance.now();

    const animate = (time) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const elapsed = time - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const lat = interpolate(startPosRef.current[0], endPosRef.current[0], easeProgress);
      const lng = interpolate(startPosRef.current[1], endPosRef.current[1], easeProgress);

      const newLatLng = [lat, lng];
      setCurrentPos(newLatLng);

      // Optionally update Leaflet directly for smoother performance bypassing React state
      if (markerRef.current) {
        markerRef.current.setLatLng(newLatLng);
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [position, duration]);

  // Handle marker dragging
  const eventHandlers = {
    dragend: (e) => {
      const latLng = e.target.getLatLng();
      const newPos = [latLng.lat, latLng.lng];
      setCurrentPos(newPos);
      startPosRef.current = newPos;
      endPosRef.current = newPos;
      if (props.eventHandlers?.dragend) {
        props.eventHandlers.dragend(e);
      }
    },
    ...props.eventHandlers
  };

  return (
    <Marker 
      ref={markerRef}
      position={currentPos} 
      icon={icon} 
      {...props}
      eventHandlers={eventHandlers}
    >
      {children}
    </Marker>
  );
}
