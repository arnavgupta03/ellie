import React, { useEffect } from 'react';
import { Elevator, Point } from '../types';
import VapiWidget from './VapiWidget';
import { VapiClient } from '@vapi-ai/server-sdk';

interface ElevatorInfoPanelProps {
  elevator?: Elevator | null;
  isNearest?: boolean;
  userLocation?: Point;
  elevatorsAvailable?: boolean;
  aiPathInstructions?: string[] | null;
  isFetchingAiPath?: boolean;
}

const ElevatorInfoPanel: React.FC<ElevatorInfoPanelProps> = ({
  elevator,
  isNearest,
  userLocation,
  elevatorsAvailable = true,
  aiPathInstructions,
  isFetchingAiPath
}) => {
  const panelBaseClasses = "p-6 bg-gray-800 rounded-lg shadow-lg text-gray-100";

  if (!elevatorsAvailable && !elevator) { // Only show this if truly no elevators available on plan
    return (
      <div className={panelBaseClasses}>
        <h3 className="text-xl font-semibold mb-2 text-indigo-300">Elevator Information</h3>
        <p className="text-gray-300">No elevators are defined or detected for the current floor plan.</p>
        <p className="mt-2 text-sm text-blue-400">
          Upload a clear floor plan for AI detection.
        </p>
      </div>
    );
  }

  if (!elevator) {
    return (
      <div className={panelBaseClasses}>
        <h3 className="text-xl font-semibold mb-2 text-indigo-300">Elevator Information</h3>
        <p className="text-gray-300">No elevator selected.</p>
        { !userLocation && <p className="mt-2 text-sm text-blue-400">Click on the map to set your location to find the nearest elevator.</p>}
        { userLocation && <p className="mt-2 text-sm text-gray-300">Click an elevator icon on the map to see its details.</p>}
      </div>
    );
  }

  return (
    <div className={panelBaseClasses}>
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-2xl font-bold text-white leading-tight">{elevator.name}</h3>
        {isNearest && (
          <span className={`px-3 py-1 text-sm font-semibold text-white bg-amber-500 rounded-full flex-shrink-0 ml-2`}>
            Nearest
          </span>
        )}
      </div>
      <div className="space-y-2 text-gray-300">
        <p>
          <span className="font-semibold text-gray-100">Floor:</span> {elevator.floor}
        </p>
        <p>
          <span className="font-semibold text-gray-100">Location (Map Coords):</span> ({Math.round(elevator.location.x)}, {Math.round(elevator.location.y)})
        </p>
        {userLocation && (
          <p>
            <span className="font-semibold text-gray-100">Distance (on map):</span> {Math.round(Math.sqrt(Math.pow(userLocation.x - elevator.location.x, 2) + Math.pow(userLocation.y - elevator.location.y, 2)))} units
          </p>
        )}
      </div>

      {(aiPathInstructions || isFetchingAiPath) && (
        <div className="mt-6 pt-4 border-t border-gray-700">
          <h4 className="text-lg font-semibold text-indigo-300 mb-2">AI Navigation Instructions:</h4>
          {isFetchingAiPath && (
            <div className="flex items-center text-sm text-gray-400">
              <div className="w-4 h-4 border-t-transparent border-indigo-400 rounded-full animate-spin mr-2" style={{borderWidth: '2px'}}></div>
              AI is planning your route...
            </div>
          )}
          {!isFetchingAiPath && aiPathInstructions && aiPathInstructions.length > 0 && (
            <div>
              <ul className="list-decimal list-inside space-y-1 text-sm text-gray-300">
                {aiPathInstructions.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
              <VapiWidget
                apiKey={import.meta.env.VITE_VAPI_PUBLIC_API_KEY}
                assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID}
                aiPathInstructions={aiPathInstructions}
              />
            </div>
          )}
           {!isFetchingAiPath && aiPathInstructions && aiPathInstructions.length === 0 && (
             <p className="text-sm text-gray-400">AI could not generate specific instructions. Please use the map path.</p>
           )}
        </div>
      )}

      {!aiPathInstructions && !isFetchingAiPath && (
        <p className="mt-6 text-sm text-gray-400 text-center">
          The path to this elevator (if your location is set) is shown on the floor plan. Set your location and select an elevator to get AI-powered path instructions.
        </p>
      )}
       <p className="mt-4 text-xs text-gray-500 text-center">AI pathfinding is experimental. Always verify your route.</p>
    </div>
  );
};

export default ElevatorInfoPanel;
