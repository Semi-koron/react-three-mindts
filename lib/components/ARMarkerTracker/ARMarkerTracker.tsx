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
import { Html } from "@react-three/drei";

interface ARMarkerTrackerProps {
  markerUrl: string; // コンパイル済みマーカーデータのURL
  children?: React.ReactNode;
}

export const ARMarkerTracker = ({
  markerUrl,
  children,
}: ARMarkerTrackerProps) => {
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
          pointerEvents: "none", // video にマウスイベントを通さない
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
  const overlayRef = useRef<HTMLCanvasElement | null>(null); // debug overlay
  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null); // video -> canvas 毎フレーム描画用
  const controllerRef = useRef<Controller | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const postMatricesRef = useRef<THREE.Matrix4[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [trackedMarkers, setTrackedMarkers] = useState<number[]>([]);

  // Anchor object ref (this is the object that will be moved to follow the marker)
  const anchorRef = useRef<THREE.Group | null>(null);

  const { camera } = useThree();

  // video -> tmp canvas 描画ループ（常時実行しておき、processVideo に tmp を渡す）
  // objectFit: "cover" で表示されている部分のみを切り取って描画
  const startVideoToCanvasLoop = () => {
    if (drawRafRef.current !== null) return;
    const loop = () => {
      const video = webcamRef.current?.video;
      const tmp = tmpCanvasRef.current;
      if (video && tmp && video.videoWidth && video.videoHeight) {
        // ensure tmp canvas pixel size matches expected controller input size
        const controller = controllerRef.current;
        const targetW = controller ? controller.inputWidth : video.videoWidth;
        const targetH = controller ? controller.inputHeight : video.videoHeight;
        if (tmp.width !== targetW || tmp.height !== targetH) {
          tmp.width = targetW;
          tmp.height = targetH;
          // keep CSS full-size to match UI
          tmp.style.width = "100%";
          tmp.style.height = "100%";
        }
        const ctx = tmp.getContext("2d")!;
        ctx.clearRect(0, 0, tmp.width, tmp.height);

        // objectFit: "cover" と同じ動作を実装
        // video の実際の解像度
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const videoAspect = videoWidth / videoHeight;

        // container（表示領域）のアスペクト比
        const containerAspect = containerSize.width / containerSize.height;

        // objectFit: "cover" の計算
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = videoWidth;
        let sourceHeight = videoHeight;

        if (videoAspect > containerAspect) {
          // video が横長 -> 左右をトリミング
          sourceWidth = videoHeight * containerAspect;
          sourceX = (videoWidth - sourceWidth) / 2;
        } else {
          // video が縦長 -> 上下をトリミング
          sourceHeight = videoWidth / containerAspect;
          sourceY = (videoHeight - sourceHeight) / 2;
        }

        // 切り取った部分を tmp canvas に描画
        ctx.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight, // source rectangle
          0,
          0,
          tmp.width,
          tmp.height // destination rectangle
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

    // overlay for debug
    if (!overlayRef.current && containerRef.current) {
      const ov = document.createElement("canvas");
      ov.style.position = "absolute";
      ov.style.top = "0";
      ov.style.left = "0";
      ov.style.pointerEvents = "none";
      ov.style.width = "100%";
      ov.style.height = "100%";
      containerRef.current.appendChild(ov);
      overlayRef.current = ov;
    }

    // tmp canvas (offscreen/hidden) - this is what controller will read each frame
    if (!tmpCanvasRef.current && containerRef.current) {
      const tmp = document.createElement("canvas");
      // set initial pixel size to video
      tmp.width = containerSize.width;
      tmp.height = containerSize.height;
      tmp.style.display = "none"; // keep hidden
      containerRef.current.appendChild(tmp);
      tmpCanvasRef.current = tmp;
    }

    // Controller init
    const controller = new Controller({
      inputWidth: containerSize.width,
      inputHeight: containerSize.height,
      maxTrack: 1,
      onUpdate: (data) => {
        if (!data || typeof data.type !== "string") return;
        if (data.type === "updateMatrix") {
          // IMPORTANT:
          // mind-ar の onUpdate が返す worldMatrix は「マーカーのワールド行列（OpenGL座標）」です。
          // 通常はカメラを動かすのではなく、マーカーに対応する Object3D の matrix に適用します。
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
            // apply to anchor object (if it exists)
            const g = anchorRef.current;
            if (g) {
              g.visible = true;
              g.matrixAutoUpdate = false;
              g.matrix.copy(final);
              g.updateMatrixWorld(true);
            }
            // update tracked list for UI
            setTrackedMarkers((prev) =>
              prev.includes(targetIndex) ? prev : [...prev, targetIndex]
            );
          } else {
            // marker lost
            const g = anchorRef.current;
            if (g) g.visible = false;
            setTrackedMarkers([]);
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
        setIsTracking(true);
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
      if (overlayRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(overlayRef.current);
        } catch {}
        overlayRef.current = null;
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

  // トラッキング開始/停止: processVideo に video ではなく tmp canvas を渡す
  const toggleTracking = () => {
    if (!controllerRef.current || !webcamRef.current?.video) return;

    if (isTracking) {
      controllerRef.current.stopProcessVideo();
      setIsTracking(false);
      setTrackedMarkers([]);
      if (anchorRef.current) anchorRef.current.visible = false;
    } else {
      const tmp = tmpCanvasRef.current;
      if (!tmp) {
        console.warn("tmp canvas not ready");
        return;
      }
      controllerRef.current.processVideo(tmp);
      setIsTracking(true);
    }
  };

  // デバッグ用：detect を tmp に対して行う
  const debugTest = async () => {
    if (!controllerRef.current) {
      console.warn("controller not ready");
      return;
    }
    const tmp = tmpCanvasRef.current;
    if (!tmp) {
      console.warn("tmp canvas not ready");
      return;
    }
    try {
      const { featurePoints, debugExtra } = await controllerRef.current.detect(
        tmp
      );
      console.log(
        "Debug detect result: featurePoints.length=",
        featurePoints.length
      );

      // overlay に可視化
      const ov = overlayRef.current;
      if (ov) {
        const ctx = ov.getContext("2d")!;
        ov.width = tmp.width;
        ov.height = tmp.height;
        ctx.clearRect(0, 0, ov.width, ov.height);
        ctx.drawImage(tmp, 0, 0, ov.width, ov.height);
        ctx.fillStyle = "red";
        featurePoints.forEach((p: any) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      const matchResult = await controllerRef.current!.match(featurePoints, 0);
      console.log("Debug match result:", matchResult);
    } catch (e) {
      console.error("debugTest error:", e);
    }
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideoToCanvasLoop();
      if (overlayRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(overlayRef.current);
        } catch {}
      }
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

      <Html
        calculatePosition={() => [0, 0]}
        zIndexRange={[-1, -1]}
        style={{
          top: 0,
          left: 0,
          zIndex: -1,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 20,
          }}
        >
          <button onClick={toggleTracking}>
            {isTracking ? "トラッキング停止" : "トラッキング開始"}
          </button>
          <button onClick={debugTest} style={{ marginLeft: 10 }}>
            デバッグテスト
          </button>
          <div style={{ color: "white", marginTop: 10 }}>
            検出中のマーカー: {trackedMarkers.join(", ") || "なし"}
          </div>
        </div>
      </Html>
    </>
  );
};
