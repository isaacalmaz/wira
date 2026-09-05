import React from 'react';
import { Navigation } from 'lucide-react';
import { Button } from './UIComponents';

const NavigationButton = ({ destination }) => {
  const handleNav = () => {
    // Membuka Google Maps di tab baru (placeholder URL)
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`, '_blank');
  };
  
  return (
    <Button variant="outline" className="flex items-center justify-center gap-2 w-full" onClick={handleNav}>
      <Navigation size={18} />
      <span>Arahkan (Maps)</span>
    </Button>
  );
};
export default NavigationButton;
