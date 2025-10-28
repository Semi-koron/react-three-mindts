import {
  Dispatch,
  RefObject,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Webcam from "react-webcam";
import { Controller } from "mind-ar/src/image-target/controller";
import * as THREE from "three";
import { Matrix4, Quaternion, Vector3 } from "three";
import { Canvas, useThree } from "@react-three/fiber";

interface ARCanvasProps {
  markerUrl: string;
  children?: React.ReactNode;
}

export const ARCanvas = ({ markerUrl, children }: ARCanvasProps) => {
  const webcamRef = useRef<Webcam>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: document.body.clientWidth,
    height: document.body.clientHeight,
  });

  const [isCameraReady, setIsCameraReady] = useState(false);

  const videoConstraints = useMemo(() => {
    return {
      facingMode: "environment",
      width: { ideal: containerSize.width },
      height: { ideal: containerSize.height },
    };
  }, [containerSize.width, containerSize.height]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      {/* three renderer canvas */}
      <Canvas style={{ position: "absolute", inset: 0 }}>
        <ARContent
          markerUrl={markerUrl}
          containerRef={containerRef}
          containerSize={containerSize}
          setContainerSize={setContainerSize}
          webcamRef={webcamRef}
          isCameraReady={isCameraReady}
        >
          {children}
        </ARContent>
      </Canvas>
      <Webcam
        ref={webcamRef}
        audio={false}
        width={containerSize.width}
        height={containerSize.height}
        videoConstraints={videoConstraints}
        onUserMedia={() => {
          setIsCameraReady(true);
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: -1,
          pointerEvents: "none",
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
};

interface ARContentProps {
  markerUrl: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerSize: {
    width: number;
    height: number;
  };
  setContainerSize: Dispatch<
    SetStateAction<{
      width: number;
      height: number;
    }>
  >;
  webcamRef: RefObject<Webcam | null>;
  isCameraReady: boolean;
  children?: React.ReactNode;
}

export const ARContent = ({
  markerUrl,
  containerRef,
  containerSize,
  setContainerSize,
  webcamRef,
  isCameraReady,
  children,
}: ARContentProps) => {
  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<Controller | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const postMatricesRef = useRef<THREE.Matrix4[]>([]);
  const anchorRef = useRef<THREE.Group | null>(null);

  const { camera } = useThree();

  const startVideoToCanvasLoop = () => {
    if (drawRafRef.current !== null) return;
    const loop = () => {
      const video = webcamRef.current?.video;
      const tmp = tmpCanvasRef.current;
      if (video && tmp && video.videoWidth && video.videoHeight) {
        const controller = controllerRef.current;
        const targetW = controller ? controller.inputWidth : video.videoWidth;
        const targetH = controller ? controller.inputHeight : video.videoHeight;
        if (tmp.width !== targetW || tmp.height !== targetH) {
          tmp.width = targetW;
          tmp.height = targetH;
          tmp.style.width = "100%";
          tmp.style.height = "100%";
        }
        const ctx = tmp.getContext("2d")!;
        ctx.clearRect(0, 0, tmp.width, tmp.height);

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const videoAspect = videoWidth / videoHeight;
        const containerAspect = containerSize.width / containerSize.height;

        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = videoWidth;
        let sourceHeight = videoHeight;

        if (videoAspect > containerAspect) {
          sourceWidth = videoHeight * containerAspect;
          sourceX = (videoWidth - sourceWidth) / 2;
        } else {
          sourceHeight = videoWidth / containerAspect;
          sourceY = (videoHeight - sourceHeight) / 2;
        }

        ctx.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          tmp.width,
          tmp.height
        );
      }
      drawRafRef.current = requestAnimationFrame(loop);
    };
    drawRafRef.current = requestAnimationFrame(loop);
  };

  // 親要素のサイズ監視
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      const { width, height } = containerRef.current!.getBoundingClientRect();
      setContainerSize({ width, height });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopVideoToCanvasLoop = () => {
    if (drawRafRef.current !== null) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
  };

  const initController = async (cancelled: { value: boolean }) => {
    const webcam = webcamRef.current;
    if (!webcam) {
      console.log("webcam not found");
      return;
    }
    const video = webcam.video;
    if (!video) {
      console.log("video element not found");
      return;
    }

    await new Promise<void>((resolve) => {
      if (
        video.readyState >= 2 &&
        containerSize.width &&
        containerSize.height
      ) {
        resolve();
      } else {
        const onLoaded = () => {
          video.removeEventListener("loadedmetadata", onLoaded);
          resolve();
        };
        video.addEventListener("loadedmetadata", onLoaded);
      }
    });
    if (cancelled.value) return;

    if (!tmpCanvasRef.current && containerRef.current) {
      const tmp = document.createElement("canvas");
      tmp.width = containerSize.width;
      tmp.height = containerSize.height;
      tmp.style.display = "none";
      containerRef.current.appendChild(tmp);
      tmpCanvasRef.current = tmp;
    }

    const controller = new Controller({
      inputWidth: containerSize.width,
      inputHeight: containerSize.height,
      maxTrack: 1,
      onUpdate: (data) => {
        if (!data || typeof data.type !== "string") {
          return;
        }
        if (data.type === "updateMatrix") {
          const { targetIndex, worldMatrix } = data as any;
          if (
            worldMatrix !== null &&
            worldMatrix &&
            postMatricesRef.current[targetIndex]
          ) {
            const wm = new Matrix4().fromArray([...worldMatrix]);
            const final = new Matrix4()
              .copy(wm)
              .multiply(postMatricesRef.current[targetIndex]);
            const g = anchorRef.current;
            if (g) {
              g.visible = true;
              g.matrixAutoUpdate = false;
              g.matrix.copy(final);
              g.updateMatrixWorld(true);
            }
          } else {
            const g = anchorRef.current;
            if (g) g.visible = false;
          }
        }
      },
      debugMode: true,
      warmupTolerance: 5,
      missTolerance: 5,
      filterMinCF: 0.001,
      filterBeta: 1000,
    });

    controllerRef.current = controller;

    // load markers
    try {
      const { dimensions: imageTargetDimensions } =
        await controller.addImageTargets(markerUrl);
      console.log("マーカー読み込み完了:", imageTargetDimensions);

      // post matrix: convert target image size into a scale/translation so your mesh matches marker
      postMatricesRef.current = imageTargetDimensions.map(
        ([markerWidth, markerHeight]) =>
          new Matrix4().compose(
            new Vector3(
              markerWidth / 2,
              markerWidth / 2 + (markerHeight - markerWidth) / 2
            ),
            new Quaternion(),
            new Vector3(markerWidth, markerWidth, markerWidth)
          )
      );

      // Apply controller projection to three.js camera (do NOT set camera transform to marker matrix)
      try {
        const proj = controller.getProjectionMatrix(); // 16 elements
        camera.projectionMatrix.fromArray(proj);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        // keep camera matrix auto updates (we keep the camera at origin and move objects instead)
        camera.matrixAutoUpdate = true;
        console.log("Applied controller projection matrix to three.js camera");
      } catch (e) {
        console.warn("Failed to apply projection matrix to camera:", e);
      }

      // warm up (do a dummy run)
      try {
        controller.dummyRun(tmpCanvasRef.current || video);
      } catch (e) {
        console.warn("controller.dummyRun error:", e);
      }

      // カメラの準備とマーカーデータの読み込みが完了したので、トラッキングを開始
      startVideoToCanvasLoop();

      // トラッキング開始
      const tmp = tmpCanvasRef.current;
      if (tmp) {
        controller.processVideo(tmp);
      } else {
        console.warn("tmp canvas not ready for auto-start");
      }
    } catch (err) {
      console.error("addImageTargets に失敗しました:", err);
    }
  };

  // Controller 初期化 (カメラ準備完了後に実行)
  useEffect(() => {
    if (!isCameraReady) return;

    const cancelledRef = { value: false };

    initController(cancelledRef);

    return () => {
      cancelledRef.value = true;
      stopVideoToCanvasLoop();
      if (controllerRef.current) {
        try {
          controllerRef.current.dispose();
        } catch {}
        controllerRef.current = null;
      }
      if (tmpCanvasRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(tmpCanvasRef.current);
        } catch {}
        tmpCanvasRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraReady, markerUrl, containerSize.width, containerSize.height]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideoToCanvasLoop();
      if (tmpCanvasRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(tmpCanvasRef.current);
        } catch {}
      }
    };
  }, []);

  return (
    <>
      <group ref={anchorRef} visible={false} matrixAutoUpdate={false}>
        {children}
      </group>
    </>
  );
};
