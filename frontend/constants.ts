
import { GeoPoint } from './types';

// Approximate geographical boundaries for a floor plan image.
// These are arbitrary for demonstration.
// Real applications need accurate georeferencing for meaningful GPS-to-pixel mapping,
// calibrated to the specific floor plan image being used.
// For custom uploaded plans without specific calibration, this provides a default conceptual mapping.
export const FLOOR_PLAN_GEO_BOUNDS = {
  northWest: { latitude: 34.0529, longitude: -118.2445 }, // Corresponds to pixel (0,0)
  southEast: { latitude: 34.0520, longitude: -118.2425 }, // Corresponds to pixel (width, height)
};


export const USER_MARKER_COLOR = "blue-500";
export const ELEVATOR_MARKER_COLOR = "green-500";
export const NEAREST_ELEVATOR_MARKER_COLOR = "red-500";
export const PATH_COLOR = "red-600";
export const MARKER_SIZE = 20; // pixels
export const ARRIVAL_THRESHOLD_PIXELS = 25; // User is considered "at" the elevator if their marker is within this many pixels.