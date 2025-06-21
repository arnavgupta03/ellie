import { Point, Elevator, GeoPoint } from '../types';
import { FLOOR_PLAN_GEO_BOUNDS } from '../constants';

export const calculateDistance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const findNearestElevator = (userLocation: Point, elevators: Elevator[]): Elevator | null => {
  if (!elevators || elevators.length === 0) {
    return null;
  }

  let nearestElevator: Elevator | null = null;
  let minDistance = Infinity;

  for (const elevator of elevators) {
    const distance = calculateDistance(userLocation, elevator.location);
    if (distance < minDistance) {
      minDistance = distance;
      nearestElevator = elevator;
    }
  }
  return nearestElevator;
};

export const calculatePath = (start: Point, end: Point): Point[] => {
  return [start, end];
};

// Helper to map a value from one range to another
const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
  if (inMin === inMax) {
    return (outMin + outMax) / 2; 
  }
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
};

export const mapGeoToPixel = (
  geoPoint: GeoPoint,
  bounds: typeof FLOOR_PLAN_GEO_BOUNDS,
  imageDimensions: { width: number; height: number }
): Point | null => {
  const { latitude, longitude } = geoPoint;
  const { northWest, southEast } = bounds;

  const isLatOutOfBounds = latitude > northWest.latitude || latitude < southEast.latitude;
  const isLonOutOfBounds = longitude < northWest.longitude || longitude > southEast.longitude;

  if (isLatOutOfBounds || isLonOutOfBounds) {
    return null; 
  }

  const x = mapRange(longitude, northWest.longitude, southEast.longitude, 0, imageDimensions.width);
  const y = mapRange(latitude, northWest.latitude, southEast.latitude, 0, imageDimensions.height);
  
  const clampedX = Math.max(0, Math.min(x, imageDimensions.width));
  const clampedY = Math.max(0, Math.min(y, imageDimensions.height));

  return { x: clampedX, y: clampedY };
};

export const mapPixelToGeo = (
  pixelPoint: Point,
  bounds: typeof FLOOR_PLAN_GEO_BOUNDS,
  imageDimensions: { width: number; height: number }
): GeoPoint | null => {
  const { x, y } = pixelPoint;

  if (x < 0 || x > imageDimensions.width || y < 0 || y > imageDimensions.height) {
    // This check is good, but mapRange will also effectively clamp/extrapolate.
    // Depending on strictness, could return null or allow mapping of points slightly outside.
    // For now, let mapRange handle it, it will produce values outside the bounds' lat/lon.
  }

  const longitude = mapRange(x, 0, imageDimensions.width, bounds.northWest.longitude, bounds.southEast.longitude);
  const latitude = mapRange(y, 0, imageDimensions.height, bounds.northWest.latitude, bounds.southEast.latitude);

  // Basic validation that generated geo points are numbers
  if (isNaN(latitude) || isNaN(longitude)) {
    return null;
  }

  return { latitude, longitude };
};
