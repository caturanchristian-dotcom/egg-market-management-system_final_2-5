import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';

// Fix for default marker icon in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface CustomerLocationMapProps {
  latitude: number;
  longitude: number;
  customerName: string;
  address: string;
  purok?: string;
  height?: string;
}

/**
 * CustomerLocationMap Component
 * A lightweight map view to show a specific customer's delivery location.
 */
export default function CustomerLocationMap({ 
  latitude, 
  longitude, 
  customerName, 
  address, 
  purok,
  height = '200px'
}: CustomerLocationMapProps) {
  const position: [number, number] = [latitude, longitude];

  return (
    <div className="rounded-xl overflow-hidden border border-emerald-100 shadow-sm z-0" style={{ height }}>
      <MapContainer 
        center={position} 
        zoom={15} 
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>
            <div className="p-1">
              <p className="font-bold text-emerald-900 text-xs">{customerName}</p>
              <div className="flex items-start gap-1 text-emerald-600 mt-1">
                <MapPin size={10} className="mt-0.5 shrink-0" />
                <p className="text-[10px] leading-tight">
                  {purok && `Purok ${purok}, `}
                  {address}
                </p>
              </div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
