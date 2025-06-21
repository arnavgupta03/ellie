export interface Point {
  x: number;
  y: number;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Elevator {
  id: string;
  name: string;
  location: Point;
  floor: number | string; // Allow string for "N/A"
}

export interface FloorPlan {
  id: string;
  name: string;
  imageUrl: string;
  elevators: Elevator[];
  dimensions: {
    width: number;
    height: number;
  };
}

// Expected structure from Gemini for elevator detection
export interface GeminiElevatorDetection {
  x_percent: number;
  y_percent: number;
  description: string;
}
