import { ARCanvas } from "../lib/components/ARCanvas";
import { ARMarkerTracker } from "../lib/components/ARMarkerTracker/ARMarkerTracker";
import "./index.module.css";

export const App = () => {
  return <ARMarkerTracker markerUrl="./targets.mind" />;
};
