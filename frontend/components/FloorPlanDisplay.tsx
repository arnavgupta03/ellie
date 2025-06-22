
import React from 'react';
import { Point, Elevator, FloorPlan } from '../types';
import { USER_MARKER_COLOR, ELEVATOR_MARKER_COLOR, NEAREST_ELEVATOR_MARKER_COLOR, MARKER_SIZE } from '../constants'; // PATH_COLOR removed as it's not used directly here anymore

interface FloorPlanDisplayProps {
  floorPlan: FloorPlan;
  userLocation?: Point;
  nearestElevator?: Elevator;
  path?: Point[];
  onMapClick: (point: Point) => void;
  selectedElevatorId?: string | null;
  onElevatorClick: (elevatorId: string) => void;
}

const FloorPlanDisplay: React.FC<FloorPlanDisplayProps> = ({
  floorPlan,
  userLocation,
  nearestElevator,
  path,
  onMapClick,
  selectedElevatorId,
  onElevatorClick,
}) => {
  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(x, floorPlan.dimensions.width));
    const clampedY = Math.max(0, Math.min(y, floorPlan.dimensions.height));

    onMapClick({ x: clampedX, y: clampedY });
  };

  const pathPointsToString = (points: Point[]): string => {
    return points.map(p => `${p.x},${p.y}`).join(' ');
  };

  return (
    <div className="relative shadow-lg rounded-lg overflow-hidden border-2 border-gray-700 bg-gray-800">
      <div
        className="relative cursor-crosshair"
        style={{
          width: floorPlan.dimensions.width,
          height: floorPlan.dimensions.height,
        }}
        onClick={handleMapClick}
      >
        <img
          src={floorPlan.imageUrl}
          alt={floorPlan.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
          draggable="false"
        />

        {userLocation && (
          <div
            className={`absolute rounded-full shadow-md border-2 border-white transform -translate-x-1/2 -translate-y-1/2 bg-${USER_MARKER_COLOR} transition-all duration-300 ease-in-out`}
            style={{
              left: `${userLocation.x}px`,
              top: `${userLocation.y}px`,
              width: `${MARKER_SIZE}px`,
              height: `${MARKER_SIZE}px`,
            }}
            title={`Your Location: (${Math.round(userLocation.x)}, ${Math.round(userLocation.y)})`}
          />
        )}

        {floorPlan.elevators.map((elevator) => {
          const isNearest = nearestElevator?.id === elevator.id;
          const isSelected = selectedElevatorId === elevator.id;
          let bgColorClass = `bg-${ELEVATOR_MARKER_COLOR}`;
          let zIndex = 10;
          let currentMarkerSize = MARKER_SIZE;

          if (isNearest && !isSelected) { 
            bgColorClass = `bg-${NEAREST_ELEVATOR_MARKER_COLOR}`;
            zIndex = 30;
            currentMarkerSize = MARKER_SIZE * 1.5;
          } else if (isSelected) {
            bgColorClass = `bg-amber-400`; 
            zIndex = 20; 
            currentMarkerSize = MARKER_SIZE * 1.25;
          }
          
          return (
            <div
              key={elevator.id}
              className={`absolute rounded-full shadow-md border-2 border-white transform -translate-x-1/2 -translate-y-1/2 cursor-pointer hover:scale-125 transition-all duration-200 ease-in-out ${bgColorClass}`}
              style={{
                left: `${elevator.location.x}px`,
                top: `${elevator.location.y}px`,
                width: `${currentMarkerSize}px`,
                height: `${currentMarkerSize}px`,
                zIndex: zIndex,
              }}
              title={elevator.name}
              onClick={(e) => {
                e.stopPropagation();
                onElevatorClick(elevator.id);
              }}
            />
          );
        })}

        {path && path.length >= 2 && userLocation && (
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={floorPlan.dimensions.width}
            height={floorPlan.dimensions.height}
            style={{ zIndex: 5 }}
          >
            <polyline
              points={pathPointsToString(path)}
              stroke="#3b82f6" // Changed to blue (Tailwind blue-500)
              strokeWidth="6"
              strokeOpacity="1" 
              fill="none" 
            />
          </svg>
        )}
      </div>
    </div>
  );
};

export default FloorPlanDisplay;
