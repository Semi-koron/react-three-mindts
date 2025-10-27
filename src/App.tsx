import { ARCanvas } from "../lib/components/ARCanvas";
import style from "./index.module.css";

export const App = () => {
  return (
    <main>
      <div className={style.container}>
        <ARCanvas markerUrl="/kyutxr-card.mind">
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="orange" />
          </mesh>
          <ambientLight intensity={1} />
        </ARCanvas>
      </div>
    </main>
  );
};
