
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { FloorPlan, Point, Elevator, GeoPoint, GeminiElevatorDetection } from './types';
import { FLOOR_PLAN_GEO_BOUNDS, ARRIVAL_THRESHOLD_PIXELS, MARKER_SIZE } from './constants';
import FloorPlanDisplay from './components/FloorPlanDisplay';
import ElevatorInfoPanel from './components/ElevatorInfoPanel';
import { findNearestElevator, calculatePath, mapGeoToPixel, mapPixelToGeo, calculateDistance } from './services/navigationService';

let ai: GoogleGenAI | null = null;
try {
  if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  } else {
    console.warn("API_KEY environment variable not set. Gemini features will be unavailable.");
  }
} catch (error) {
  console.error("Error initializing GoogleGenAI:", error);
  ai = null;
}

const initialAppStatus = "Please upload a floor plan to get started.";

interface AiPathResponse {
  path_coordinates: Point[];
  step_by_step_instructions: string[];
}

const App: React.FC = () => {
  const [currentFloorPlan, setCurrentFloorPlan] = useState<FloorPlan | null>(null);
  const [userLocation, setUserLocation] = useState<Point | undefined>(undefined);
  const [userGeoLocation, setUserGeoLocation] = useState<GeoPoint | null>(null); // Last known actual GPS
  const [gpsStatus, setGpsStatus] = useState<string>(initialAppStatus);
  const [isGpsDerived, setIsGpsDerived] = useState<boolean>(false);
  const [isAnalyzingPlan, setIsAnalyzingPlan] = useState<boolean>(false);

  const [nearestElevator, setNearestElevator] = useState<Elevator | null>(null);
  const [selectedElevator, setSelectedElevator] = useState<Elevator | null>(null); // This is the navigation target
  const [path, setPath] = useState<Point[] | undefined>(undefined);
  const [aiPathInstructions, setAiPathInstructions] = useState<string[] | null>(null);
  const [isFetchingAiPath, setIsFetchingAiPath] = useState<boolean>(false);


  const [isNavigatingWithGps, setIsNavigatingWithGps] = useState<boolean>(false);
  const [targetElevatorGps, setTargetElevatorGps] = useState<GeoPoint | null>(null);
  const [gpsWatchId, setGpsWatchId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopGpsNavigation = useCallback((message?: string) => {
    setIsNavigatingWithGps(false);
    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId);
      setGpsWatchId(null);
    }
    if (message) {
      setGpsStatus(message);
    } else if (selectedElevator) {
      setGpsStatus(`GPS navigation to ${selectedElevator.name} cancelled.`);
    } else if (currentFloorPlan) {
      setGpsStatus("GPS navigation stopped. Click map or an elevator to restart.");
    } else {
      setGpsStatus(initialAppStatus);
    }
  }, [gpsWatchId, selectedElevator, currentFloorPlan]);

  const resetAllLocationsAndSelections = useCallback((statusMessage?: string) => {
    setUserLocation(undefined);
    setUserGeoLocation(null);
    setNearestElevator(null);
    setSelectedElevator(null);
    setPath(undefined);
    setAiPathInstructions(null);
    setIsFetchingAiPath(false);
    setIsGpsDerived(false);
    stopGpsNavigation();
    setTargetElevatorGps(null);

    if (statusMessage) {
      setGpsStatus(statusMessage);
    } else if (currentFloorPlan) {
      setGpsStatus("Location cleared. Click map or an elevator to start.");
    } else {
      setGpsStatus(initialAppStatus);
    }
  }, [stopGpsNavigation, currentFloorPlan]);


  const fetchAiPathAndInstructions = async (
    currentUserLocation: Point,
    targetElevator: Elevator,
    plan: FloorPlan
  ) => {
    if (!ai || !plan.imageUrl) {
      setGpsStatus("AI pathfinding unavailable (AI client or image missing). Showing straight line.");
      setPath(calculatePath(currentUserLocation, targetElevator.location));
      setAiPathInstructions(["AI pathfinding is currently unavailable."]);
      return;
    }

    setIsFetchingAiPath(true);
    setAiPathInstructions(null);
    setPath(undefined); // Clear old path before fetching new one
    setGpsStatus(`AI is planning your route to ${targetElevator.name}...`);

    try {
      const base64Data = plan.imageUrl.substring(plan.imageUrl.indexOf(',') + 1);
      const imageMimeType = plan.imageUrl.substring(5, plan.imageUrl.indexOf(';'));

      const prompt = `
You are an expert indoor navigation system. Your task is to analyze the provided floor plan image and generate a navigation path and instructions.
The user is at pixel coordinates (${Math.round(currentUserLocation.x)}, ${Math.round(currentUserLocation.y)}) and wants to go to an elevator at pixel coordinates (${Math.round(targetElevator.location.x)}, ${Math.round(targetElevator.location.y)}).
The image dimensions are: width ${plan.dimensions.width}px, height ${plan.dimensions.height}px.

Your tasks:
1.  **Path Coordinates (\`path_coordinates\`):**
    *   Generate a sequence of (x, y) pixel coordinates representing a navigable path from the user's location to the elevator.
    *   **CRITICAL CONSTRAINT: The path MUST NOT pass through any solid lines depicted on the floor plan, as these represent walls or other physical barriers. Imagine a person walking; they cannot pass through walls.**
    *   **EQUALLY CRITICAL: The path MUST NOT cut through the corners of rooms or solid obstacles. Paths must maintain a realistic clearance, as if a person is walking and cannot clip through solid corners.**
    *   The path should ideally follow clear pathways (hallways, open areas). Stay within these walkable areas.
    *   The first point MUST be the user's starting location.
    *   The last point MUST be the elevator's location.
    *   The path should consist of straight line segments. Create intermediate points for turns.
    *   Prioritize routes that appear to be designated walkways. Only cross lines if they clearly represent doorways or marked openings.
    *   If a clear path considering obstacles and corners is too complex or cannot be determined, return an array with just the start and end points (a straight line).

2.  **Step-by-Step Instructions (\`step_by_step_instructions\`):**
    *   Provide concise, turn-by-turn textual instructions based on the generated \`path_coordinates\`.
    *   **Crucially, these instructions MUST use landmarks visible on the floor plan.**
    *   When referring to landmarks from the floor plan (like room names, areas, or distinct symbols), use **Title Case** (e.g., "Pauley Ballroom West", "Kerr Lobby Registration", "Terrace Sign"). Do NOT use full ALL CAPS for landmarks unless they are explicitly shown that way on the map image itself.
    *   Example: 'Walk towards the "Main Entrance" area.', 'Turn left after passing "Office Room 101".', 'The elevator is next to the "Water Fountain".'
    *   **Avoid cardinal directions (North, South, East, West)** unless they are explicitly and clearly marked on the floor plan itself relative to the user's perspective. Focus on what the user can see on the map.
    *   Keep instructions brief and clear (2-5 steps are ideal).
    *   If the path is just a straight line (start and end points only), the instructions can be simpler, e.g., "Proceed directly towards the elevator." or "The elevator is straight ahead."

Respond ONLY with a valid JSON object. Do not include any text or markdown formatting (like \`\`\`json) outside this JSON object.
The JSON object must have the following structure:
{
  "path_coordinates": [ /* array of { "x": number, "y": number } objects */ ],
  "step_by_step_instructions": [ /* array of strings */ ]
}

Example of expected JSON output (ensure landmarks are in Title Case and path avoids corners):
{
  "path_coordinates": [
    { "x": ${Math.round(currentUserLocation.x)}, "y": ${Math.round(currentUserLocation.y)} },
    { "x": ${Math.round((currentUserLocation.x + targetElevator.location.x)/2)}, "y": ${Math.round(currentUserLocation.y)} }, 
    { "x": ${Math.round((currentUserLocation.x + targetElevator.location.x)/2)}, "y": ${Math.round(targetElevator.location.y)} },
    { "x": ${Math.round(targetElevator.location.x)}, "y": ${Math.round(targetElevator.location.y)} }
  ],
  "step_by_step_instructions": [
    "Proceed forward along the current corridor.",
    "Turn right when you reach the 'Main Hallway', ensuring you clear the corner.",
    "Continue past the 'Reception Desk'.",
    "The 'Elevator Group A' will be on your left."
  ]
}

If a path that avoids obvious obstacles and corners cannot be determined, or if it's a very short distance, this is also acceptable:
{
  "path_coordinates": [
    { "x": ${Math.round(currentUserLocation.x)}, "y": ${Math.round(currentUserLocation.y)} },
    { "x": ${Math.round(targetElevator.location.x)}, "y": ${Math.round(targetElevator.location.y)} }
  ],
  "step_by_step_instructions": [
    "Proceed directly towards the elevator, visible on the map."
  ]
}
`;

      const imagePart = { inlineData: { mimeType: imageMimeType, data: base64Data } };
      const textPart = { text: prompt };

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: { parts: [imagePart, textPart] },
        config: { responseMimeType: "application/json" }
      });

      let jsonString = response.text.trim();
      const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonString.match(fenceRegex);
      if (match && match[1]) jsonString = match[1].trim();

      const aiResponse: AiPathResponse = JSON.parse(jsonString);

      if (aiResponse.path_coordinates && Array.isArray(aiResponse['step_by_step_instructions'])) {
        if (aiResponse.path_coordinates.length >= 2 && aiResponse['step_by_step_instructions'].length > 0 ) {
          const validatedPath = [...aiResponse.path_coordinates];
          validatedPath[0] = currentUserLocation;
          validatedPath[validatedPath.length - 1] = targetElevator.location;

          setPath(validatedPath);
          setAiPathInstructions(aiResponse['step_by_step_instructions']);
          setGpsStatus(`AI path to ${targetElevator.name} generated. Follow instructions.`);
        } else { 
          setGpsStatus(`AI could not determine a multi-segment path for ${targetElevator.name}. Showing straight line.`);
          setPath(calculatePath(currentUserLocation, targetElevator.location));
          setAiPathInstructions(aiResponse['step_by_step_instructions'].length > 0 ? aiResponse['step_by_step_instructions'] : [
            "AI was unable to determine a detailed path.",
            "A straight line to the elevator is shown on the map.",
          ]);
        }
      } else {
        throw new Error("AI returned improperly structured path or instructions.");
      }
    } catch (error) {
      console.error("Error fetching AI path and instructions:", error);
      setGpsStatus(`AI pathfinding failed for ${targetElevator.name}. Showing straight line.`);
      setPath(calculatePath(currentUserLocation, targetElevator.location));
      setAiPathInstructions([
        "AI pathfinding system encountered an error.",
        "A straight line to the elevator is shown on the map.",
        "Please use visual cues on the floor plan to navigate."
      ]);
    } finally {
      setIsFetchingAiPath(false);
    }
  };


  const processGpsLocation = useCallback((geoPoint: GeoPoint, contextMessage?: string) => {
    if (!currentFloorPlan || !currentFloorPlan.dimensions.width) {
      setGpsStatus("Cannot process GPS location: Floor plan not fully loaded.");
      return;
    }

    setUserGeoLocation(geoPoint);
    const pixelLocation = mapGeoToPixel(geoPoint, FLOOR_PLAN_GEO_BOUNDS, currentFloorPlan.dimensions);

    if (pixelLocation) {
      const oldUserLocation = userLocation;
      setUserLocation(pixelLocation);
      setIsGpsDerived(true);
      let status = contextMessage || `GPS Updated: (${geoPoint.latitude.toFixed(4)}, ${geoPoint.longitude.toFixed(4)}). Mapped to plan.`;
      status += " (Note: GPS mapping is approximate for uploaded plans.)";

      if (isNavigatingWithGps && selectedElevator) {
        const distanceToTarget = calculateDistance(pixelLocation, selectedElevator.location);
        if (distanceToTarget < ARRIVAL_THRESHOLD_PIXELS) {
          status = `Arrived at ${selectedElevator.name}!`;
          stopGpsNavigation(status);
           setPath(undefined); // Clear path on arrival
        } else {
          status = `Navigating to ${selectedElevator.name}... User location updated by GPS.`;
          
          if (aiPathInstructions && path && path.length > 0) {
             const updatedAiPath = [...path];
             updatedAiPath[0] = pixelLocation;
             setPath(updatedAiPath);
          } else if (!aiPathInstructions && !isFetchingAiPath && (!oldUserLocation || calculateDistance(pixelLocation, oldUserLocation) > MARKER_SIZE * 2 )) {
            fetchAiPathAndInstructions(pixelLocation, selectedElevator, currentFloorPlan);
          } else if (!isFetchingAiPath) {
            setPath(calculatePath(pixelLocation, selectedElevator.location));
          }
        }
      } else if (selectedElevator && !isNavigatingWithGps && !isFetchingAiPath) {
         fetchAiPathAndInstructions(pixelLocation, selectedElevator, currentFloorPlan);
      } else if (!selectedElevator && !isFetchingAiPath) {
        const nearest = findNearestElevator(pixelLocation, currentFloorPlan.elevators);
        setNearestElevator(nearest);
        if (nearest) {
          setPath(calculatePath(pixelLocation, nearest.location)); 
        }
      }
      setGpsStatus(status);
    } else {
      setIsGpsDerived(false);
      let status = `GPS: (${geoPoint.latitude.toFixed(4)}, ${geoPoint.longitude.toFixed(4)}). Your location appears outside the mapped area of this plan.`;
       if (isNavigatingWithGps && selectedElevator) {
        status = `Navigating to ${selectedElevator.name}: User appears outside mapped area.`;
      }
      setGpsStatus(status);
    }
  }, [currentFloorPlan, isNavigatingWithGps, selectedElevator, stopGpsNavigation, aiPathInstructions, isFetchingAiPath, path, userLocation]);

  useEffect(() => {
    if (!currentFloorPlan || !navigator.geolocation) {
      if (!currentFloorPlan) setGpsStatus(initialAppStatus);
      else setGpsStatus("GPS not supported. Click map to set location.");
      return;
    }
    setGpsStatus("Attempting initial GPS location for current plan...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const geoPoint = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        processGpsLocation(geoPoint, "Initial GPS location acquired for current plan.");
      },
      (error) => {
        setGpsStatus(`Initial GPS failed: ${error.message}. Click map or an elevator.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [processGpsLocation, currentFloorPlan]);

  useEffect(() => {
    if (isNavigatingWithGps && selectedElevator && currentFloorPlan) {
      if (!navigator.geolocation) {
        stopGpsNavigation("GPS not supported, cannot navigate.");
        return;
      }
      setGpsStatus( prev => prev.includes("Targeting") || prev.includes("Navigating to") || prev.includes("AI is planning") ? prev : `Starting GPS navigation to ${selectedElevator.name}...`);

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          processGpsLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          stopGpsNavigation(`GPS Navigation Error: ${error.message}.`);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
      setGpsWatchId(watchId);

      return () => {
        if (watchId) navigator.geolocation.clearWatch(watchId);
        setGpsWatchId(null);
      };
    } else {
        if (gpsWatchId) {
            navigator.geolocation.clearWatch(gpsWatchId);
            setGpsWatchId(null);
        }
    }
  }, [isNavigatingWithGps, selectedElevator, processGpsLocation, stopGpsNavigation, currentFloorPlan]);


  const handleManualMapClick = useCallback((point: Point) => {
    if (isAnalyzingPlan || !currentFloorPlan || isFetchingAiPath) return;
    stopGpsNavigation("Manual location set. GPS navigation stopped.");
    setUserLocation(point);
    setIsGpsDerived(false);
    setAiPathInstructions(null); 

    const nearest = findNearestElevator(point, currentFloorPlan.elevators);
    if (nearest) {
      setSelectedElevator(nearest);
      fetchAiPathAndInstructions(point, nearest, currentFloorPlan);
      const elevGps = mapPixelToGeo(nearest.location, FLOOR_PLAN_GEO_BOUNDS, currentFloorPlan.dimensions);
      setTargetElevatorGps(elevGps);
      setIsNavigatingWithGps(true);
    } else {
      setSelectedElevator(null);
      setPath(undefined);
      setTargetElevatorGps(null);
      setGpsStatus("Location set manually. No elevators found or defined for this plan.");
    }
  }, [currentFloorPlan, isAnalyzingPlan, stopGpsNavigation, isFetchingAiPath]);

  const handleElevatorClick = useCallback((elevatorId: string) => {
    if (isAnalyzingPlan || !currentFloorPlan || !currentFloorPlan.elevators || currentFloorPlan.elevators.length === 0 || isFetchingAiPath) return;
    const elevator = currentFloorPlan.elevators.find(e => e.id === elevatorId);
    if (elevator) {
      stopGpsNavigation();
      setSelectedElevator(elevator);
      setAiPathInstructions(null);

      const elevGps = mapPixelToGeo(elevator.location, FLOOR_PLAN_GEO_BOUNDS, currentFloorPlan.dimensions);
      setTargetElevatorGps(elevGps);

      if (userLocation) {
        fetchAiPathAndInstructions(userLocation, elevator, currentFloorPlan);
         setIsNavigatingWithGps(true);
      } else {
         setPath(undefined);
        let statusMsg = `Targeting ${elevator.name}. `;
        if (elevGps) {
          statusMsg += `(Est. GPS: ${elevGps.latitude.toFixed(4)}, ${elevGps.longitude.toFixed(4)}) `;
          statusMsg += "(Elevator GPS is speculative for uploaded plans). ";
        }
        statusMsg += "Set your location (click map) to start navigation and get AI path.";
        setGpsStatus(statusMsg);
      }
    }
  }, [currentFloorPlan, isAnalyzingPlan, userLocation, stopGpsNavigation, isFetchingAiPath]);

 
 useEffect(() => {
    if (userLocation && currentFloorPlan) {
      if (!selectedElevator) { 
        const foundNearest = findNearestElevator(userLocation, currentFloorPlan.elevators);
        setNearestElevator(foundNearest);
        if (foundNearest && !isFetchingAiPath && !aiPathInstructions) { 
          setPath(calculatePath(userLocation, foundNearest.location));
        } else if (!foundNearest) {
          if (!isFetchingAiPath) setPath(undefined); 
        }
      } else {
        setNearestElevator(null); 
        
         if (!isFetchingAiPath && !aiPathInstructions) {
            setPath(calculatePath(userLocation, selectedElevator.location));
        }
      }
    } else {
      setNearestElevator(null);
      if (!isFetchingAiPath) setPath(undefined);
    }
  }, [userLocation, currentFloorPlan, selectedElevator, isFetchingAiPath, aiPathInstructions]);


  const analyzeFloorPlanWithGemini = async (
    imageUrl: string,
    imageMimeType: string,
    imageWidth: number,
    imageHeight: number,
    planName: string
  ) => {
    if (!ai) {
      resetAllLocationsAndSelections(`Uploaded '${planName}'. AI analysis skipped (AI client not init). Elevators cleared.`);
      setCurrentFloorPlan({
        id: `custom-${Date.now()}`, name: planName, imageUrl,
        dimensions: { width: imageWidth, height: imageHeight }, elevators: [],
      });
      setIsAnalyzingPlan(false);
      return;
    }

    try {
      const base64Data = imageUrl.substring(imageUrl.indexOf(',') + 1);
      const prompt = `Analyze this floor plan image to identify the locations of all elevators.
Look for common visual symbols for elevators, such as a rectangle with a cross (X) inside it, or two adjacent rectangles with opposing arrows. Also consider areas explicitly labeled "ELEVATOR", "ELEV", or "LIFT" (case-insensitive).

For each elevator detected, provide:
1. Its x-coordinate as a percentage of the image's total width (from the left edge).
2. Its y-coordinate as a percentage of the image's total height (from the top edge).
3. A brief description of the elevator or its surroundings (e.g., "Elevator near main lobby", "Small elevator, West corridor", "Elevator labeled 'LIFT B'").

Respond ONLY with a valid JSON array of objects. Each object in the array must represent a single elevator and must have the following keys:
- "x_percent": A number representing the x-coordinate percentage (e.g., 25.5).
- "y_percent": A number representing the y-coordinate percentage (e.g., 70.1).
- "description": A string containing the brief description.

Example of expected JSON output:
[
  { "x_percent": 15.0, "y_percent": 30.5, "description": "Elevator near main entrance" },
  { "x_percent": 80.2, "y_percent": 65.0, "description": "West wing service lift" }
]

If no elevators are clearly identifiable, or if you are uncertain, return an empty JSON array: [].
Do not include any explanatory text or markdown formatting (like \`\`\`json) outside of the JSON array itself.`;

      const imagePart = { inlineData: { mimeType: imageMimeType, data: base64Data }};
      const textPart = { text: prompt };

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: { parts: [imagePart, textPart] },
        config: { responseMimeType: "application/json" }
      });

      let jsonString = response.text.trim();
      const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonString.match(fenceRegex);
      if (match && match[1]) jsonString = match[1].trim();

      const detectedElevatorsRaw: GeminiElevatorDetection[] = JSON.parse(jsonString);
      const newElevators: Elevator[] = detectedElevatorsRaw.map((item, index) => ({
        id: `ai-elevator-${Date.now()}-${index}`,
        name: item.description || `AI Detected Elevator ${index + 1}`,
        location: {
          x: (item.x_percent / 100) * imageWidth,
          y: (item.y_percent / 100) * imageHeight,
        },
        floor: "N/A (AI)",
      }));

      setCurrentFloorPlan({
        id: `custom-${Date.now()}`, name: planName, imageUrl,
        dimensions: { width: imageWidth, height: imageHeight }, elevators: newElevators,
      });

      if (newElevators.length > 0) {
        setGpsStatus(`AI analysis complete for '${planName}'. Found ${newElevators.length} elevator(s). Attempting initial GPS. Click map or an elevator to start navigation.`);
      } else {
        setGpsStatus(`AI analysis complete for '${planName}'. No elevators detected. Attempting initial GPS. Click map to set location.`);
      }

    } catch (error) {
      console.error("Error analyzing floor plan with AI:", error);
      setCurrentFloorPlan({
        id: `custom-${Date.now()}`, name: planName, imageUrl,
        dimensions: { width: imageWidth, height: imageHeight }, elevators: [],
      });
      setGpsStatus(`Error during AI analysis for '${planName}'. Plan loaded without elevators. Check console. Attempting initial GPS.`);
    } finally {
      setIsAnalyzingPlan(false);
    }
  };

  const handleFloorPlanUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isAnalyzingPlan) return;
    const file = event.target.files?.[0];
    if (file) {
      setIsAnalyzingPlan(true);
      resetAllLocationsAndSelections(`Uploading '${file.name}'...`);
      setCurrentFloorPlan({
        id: `custom-loading-${Date.now()}`,
        name: `Processing '${file.name}'...`,
        imageUrl: "",
        dimensions: { width: currentFloorPlan?.dimensions.width || 800, height: currentFloorPlan?.dimensions.height || 600 },
        elevators: [],
      });
      setGpsStatus(`AI is analyzing '${file.name}'... Please wait.`);


      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          analyzeFloorPlanWithGemini(imageUrl, file.type, img.naturalWidth, img.naturalHeight, file.name);
        };
        img.onerror = () => {
            setGpsStatus("Error: Could not load uploaded image data.");
            setIsAnalyzingPlan(false);
            setCurrentFloorPlan(null);
        }
        img.src = imageUrl;
      };
      reader.onerror = () => {
          setGpsStatus("Error: Could not read file.");
          setIsAnalyzingPlan(false);
          setCurrentFloorPlan(null);
      }
      reader.readAsDataURL(file);
    }
    if(event.target) event.target.value = '';
  };

  const triggerFileUpload = () => { if (!isAnalyzingPlan && !isFetchingAiPath) fileInputRef.current?.click(); }

  const displayedElevatorInfo = selectedElevator || nearestElevator;
  const noElevatorsOnPlan = !currentFloorPlan || currentFloorPlan.elevators.length === 0;


  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-8 flex flex-col items-center">
      <header className="mb-6 sm:mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-sky-400 to-blue-400">
          Elli
        </h1>
      </header>

      <div className="w-full max-w-7xl flex flex-col lg:flex-row gap-6 lg:gap-8">
        <div className="lg:w-1/3 space-y-6 flex-shrink-0">
          <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
            <div>
              <h2 className="text-xl font-semibold mb-3 text-indigo-300 border-b border-gray-700 pb-2">Floor Plan</h2>
              <div className="space-y-3">
                <button
                    onClick={triggerFileUpload} disabled={isAnalyzingPlan || !ai || isFetchingAiPath}
                    className={`w-full text-white font-semibold py-2.5 px-4 rounded-md transition shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-opacity-75 ${
                        isAnalyzingPlan || !ai || isFetchingAiPath
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                    }`}
                >
                    {isAnalyzingPlan ? 'Analyzing Plan...' : (isFetchingAiPath ? 'AI Planning Route...' : 'Upload & AI Analyze Plan')}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFloorPlanUpload} accept="image/*" className="hidden" disabled={isAnalyzingPlan || isFetchingAiPath}/>
                {!ai && <p className="text-xs text-amber-400 mt-1">AI analysis (Gemini) unavailable. Check API Key.</p>}
              </div>
            </div>

            <hr className="border-gray-700 my-6" />

            <div>
              <h2 className="text-xl font-semibold mb-3 text-indigo-300 border-b border-gray-700 pb-2">Navigation & Location</h2>
              {isNavigatingWithGps && currentFloorPlan && (
                 <button
                    onClick={() => stopGpsNavigation()} disabled={isFetchingAiPath}
                    className={`w-full text-white font-semibold py-2.5 px-4 rounded-md mb-3 transition shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-opacity-75 ${
                        isFetchingAiPath ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                    }`}
                > Cancel GPS Navigation </button>
              )}
              <div className="text-sm text-gray-300 mb-2 h-24 overflow-y-auto custom-scrollbar p-3 bg-gray-700 rounded-md relative shadow-inner">
                {gpsStatus}
                {(isAnalyzingPlan || isFetchingAiPath) &&  (
                    <div className="absolute inset-0 bg-gray-700 bg-opacity-50 flex items-center justify-center rounded-md pointer-events-none">
                        <div className="w-5 h-5 border-t-transparent border-indigo-400 rounded-full animate-spin" style={{borderWidth: '3px'}}></div>
                    </div>
                )}
                 {isNavigatingWithGps && !gpsStatus.includes("Arrived") && !gpsStatus.includes("Error") && !gpsStatus.includes("AI is planning") && !gpsStatus.includes("AI pathfinding failed") && !isAnalyzingPlan && !isFetchingAiPath && (
                    <div className="absolute inset-0 bg-gray-700 bg-opacity-25 flex items-center justify-center pointer-events-none rounded-md">
                        <div className="w-5 h-5 border-t-transparent border-green-400 rounded-full animate-spin" style={{borderWidth: '3px'}}></div>
                    </div>
                )}
              </div>

              {userLocation && currentFloorPlan && (
                <div className="mt-3 text-sm p-3 bg-gray-700 rounded-md shadow-inner">
                  <p className={`font-semibold ${isGpsDerived ? 'text-indigo-400' : 'text-blue-400'}`}>
                      📍 Your Location {isGpsDerived ? "(Live GPS)" : "(Manual)"}: ({Math.round(userLocation.x)}, {Math.round(userLocation.y)})
                  </p>
                  {userGeoLocation && isGpsDerived && <p className="text-xs text-gray-400">GPS: {userGeoLocation.latitude.toFixed(5)}, {userGeoLocation.longitude.toFixed(5)}</p>}
                </div>
              )}
              {targetElevatorGps && selectedElevator && currentFloorPlan && (
                 <div className="mt-2 text-xs p-3 bg-gray-700 rounded-md shadow-inner">
                    <p className="font-semibold text-sky-400">🎯 Target: {selectedElevator.name}</p>
                    <p className="text-gray-400">Est. GPS: {targetElevatorGps.latitude.toFixed(5)}, {targetElevatorGps.longitude.toFixed(5)}
                    {" (Note: Elevator GPS speculative for uploaded plans)"}</p>
                 </div>
              )}
               {currentFloorPlan && <p className="mt-3 text-xs text-gray-500">
                  Tip: Click map to set location & find nearest elevator for GPS nav. Or click an elevator icon directly. AI pathfinding is experimental.
              </p>}
            </div>
          </div>

          {currentFloorPlan && (
            <div className="sticky top-8">
                <ElevatorInfoPanel
                  elevator={noElevatorsOnPlan ? null : displayedElevatorInfo}
                  isNearest={!noElevatorsOnPlan && displayedElevatorInfo?.id === nearestElevator?.id && !!nearestElevator && !selectedElevator}
                  userLocation={userLocation}
                  elevatorsAvailable={!noElevatorsOnPlan}
                  aiPathInstructions={aiPathInstructions}
                  isFetchingAiPath={isFetchingAiPath}
                />
            </div>
          )}
        </div>

        <div className="lg:w-2/3 flex-grow overflow-x-auto">
          <div className="flex justify-center items-start p-1 bg-gray-800 rounded-lg shadow-lg min-h-[300px] lg:min-h-[500px]">
            {currentFloorPlan && currentFloorPlan.imageUrl ? (
                <FloorPlanDisplay
                    floorPlan={currentFloorPlan}
                    userLocation={userLocation}
                    nearestElevator={selectedElevator ? undefined : nearestElevator}
                    path={path}
                    onMapClick={handleManualMapClick}
                    selectedElevatorId={selectedElevator?.id}
                    onElevatorClick={handleElevatorClick}
                />
            ) : isAnalyzingPlan || isFetchingAiPath ? (
                 <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-xl p-4 text-center">
                    <div className="w-12 h-12 border-t-transparent border-indigo-400 rounded-full animate-spin mb-4" style={{borderWidth: '4px'}}></div>
                    {isAnalyzingPlan ? "Processing floor plan..." : "AI is planning your route..."}
                </div>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-xl p-4 text-center border-2 border-dashed border-gray-700 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="font-semibold">No floor plan loaded.</p>
                    <p className="text-sm">Please upload a floor plan image to begin.</p>
                    <button
                        onClick={triggerFileUpload} disabled={!ai}
                         className={`mt-6 text-white font-semibold py-2.5 px-6 rounded-md transition shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-opacity-75 ${
                            !ai
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                        }`}
                    >
                        Upload Plan
                    </button>
                    {!ai && <p className="text-xs text-amber-400 mt-2">AI analysis is unavailable. Check API Key configuration to enable it.</p>}
                </div>
            )}
          </div>
        </div>
      </div>

      <footer className="mt-12 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} Elli. All rights reserved.</p>
        <p>AI features (elevator detection, pathfinding, GPS navigation) are experimental. Use with caution and verify important navigation.</p>
      </footer>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #4b5563; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background-color: #374151; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};

export default App;
