import { ARCanvas } from "../lib/components/ARCanvas";
import { ARMarkerTracker } from "../lib/components/ARMarkerTracker/ARMarkerTracker";
import "./index.module.css";

export const App = () => {
  return (
    <ARMarkerTracker markerUrl="./targets.mind">
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      <ambientLight intensity={0.5} />
    </ARMarkerTracker>
  );
};
