import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { Controller } from "mind-ar/src/image-target/controller";
import * as THREE from "three";

interface ARMarkerTrackerProps {
  markerUrl: string; // コンパイル済みマーカーデータのURL
}

export const ARMarkerTracker = ({ markerUrl }: ARMarkerTrackerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // three renderer canvas
  const overlayRef = useRef<HTMLCanvasElement | null>(null); // debug overlay
  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null); // video -> canvas 毎フレーム描画用
  const controllerRef = useRef<Controller | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rafRef = useRef<number | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackedMarkers, setTrackedMarkers] = useState<number[]>([]);
  const [containerSize, setContainerSize] = useState({
    width: document.body.clientWidth,
    height: document.body.clientHeight,
  });
  const [initialized, setInitialized] = useState(false);

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
  }, []);

  const videoConstraints = {
    facingMode: "environment",
    width: { ideal: containerSize.width },
    height: { ideal: containerSize.height },
  };

  // Three renderer loop
  const startRenderLoop = () => {
    if (rafRef.current !== null) return;
    const loop = () => {
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };
  const stopRenderLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // video -> tmp canvas 描画ループ（常時実行しておき、processVideo に tmp を渡す）
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
        // drawImage using destination canvas size to ensure full coverage
        ctx.drawImage(video, 0, 0, tmp.width, tmp.height);
      }
      drawRafRef.current = requestAnimationFrame(loop);
    };
    drawRafRef.current = requestAnimationFrame(loop);
  };
  const stopVideoToCanvasLoop = () => {
    if (drawRafRef.current !== null) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
  };

  // Controller 初期化
  useEffect(() => {
    let cancelled = false;
    const initController = async () => {
      const webcam = webcamRef.current;
      if (!webcam) return;
      const video = webcam.video;
      if (!video) return;

      await new Promise<void>((resolve) => {
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
          resolve();
        } else {
          const onLoaded = () => {
            video.removeEventListener("loadedmetadata", onLoaded);
            resolve();
          };
          video.addEventListener("loadedmetadata", onLoaded);
        }
      });
      if (cancelled) return;

      const width = video.videoWidth;
      const height = video.videoHeight;

      // Three.js init
      const scene = new THREE.Scene();
      const canvas = canvasRef.current!;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
      });
      // pixel size
      canvas.width = width;
      canvas.height = height;
      renderer.setSize(width, height, false);
      sceneRef.current = scene;
      rendererRef.current = renderer;

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
        tmp.width = width;
        tmp.height = height;
        tmp.style.display = "none"; // keep hidden
        containerRef.current.appendChild(tmp);
        tmpCanvasRef.current = tmp;
      }

      // Controller init
      const controller = new Controller({
        inputWidth: width,
        inputHeight: height,
        maxTrack: 1,
        onUpdate: (data) => {
          if (!data || typeof data.type !== "string") return;
          if (data.type === "updateMatrix") {
            handleMatrixUpdate(data.targetIndex, data.worldMatrix);
          } else if (data.type === "processDone") {
            // optional debug hook
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
        const result = await controller.addImageTargets(markerUrl);
        console.log("マーカー読み込み完了:", result.dimensions);

        // projection matrix -> three camera
        let projectionMatrix: any =
          (controller as any).projectionMatrix ||
          (controller as any).getProjectionMatrix?.();
        if (projectionMatrix) {
          if (Array.isArray(projectionMatrix[0]))
            projectionMatrix = projectionMatrix.flat();
          const camera = new THREE.Camera();
          camera.projectionMatrix.fromArray(projectionMatrix);
          cameraRef.current = camera;
        } else {
          const camera = new THREE.PerspectiveCamera(
            45,
            width / height,
            0.1,
            1000
          );
          cameraRef.current = camera;
        }

        // warm up (do a dummy run)
        try {
          controller.dummyRun(tmpCanvasRef.current || video);
        } catch (e) {
          console.warn("controller.dummyRun error:", e);
        }

        // add AR objects
        addARObjects(scene, result.dimensions);

        // start loops
        startRenderLoop();
        startVideoToCanvasLoop();

        setInitialized(true);
      } catch (err) {
        console.error("addImageTargets に失敗しました:", err);
      }
    };

    initController();

    return () => {
      cancelled = true;
      stopRenderLoop();
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
  }, [markerUrl]);

  // トラッキング開始/停止: processVideo に video ではなく tmp canvas を渡す
  const toggleTracking = () => {
    if (!controllerRef.current || !webcamRef.current?.video) return;

    if (isTracking) {
      controllerRef.current.stopProcessVideo();
      setIsTracking(false);
      setTrackedMarkers([]);
    } else {
      const tmp = tmpCanvasRef.current;
      if (!tmp) {
        console.warn("tmp canvas not ready");
        return;
      }
      // tmp は startVideoToCanvasLoop により毎フレーム video を描いているので
      // controller.processVideo(tmp) とすることで、controller のループが常に最新のフレームを読む
      controllerRef.current.processVideo(tmp);
      setIsTracking(true);
    }
  };

  // デバッグ用：detect を tmp に対して行う
  const debugTest = async () => {
    console.log("Debug Test");
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
      console.log(featurePoints);
      console.log("debugExtra:", debugExtra);

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

  // マーカー検出時の処理
  const handleMatrixUpdate = (
    targetIndex: number | undefined,
    worldMatrix: number[] | null
  ) => {
    if (!sceneRef.current) return;
    if (typeof targetIndex !== "number") return;

    const arObject = sceneRef.current.getObjectByName(`marker_${targetIndex}`);

    if (worldMatrix && arObject) {
      try {
        (arObject.matrix as THREE.Matrix4).fromArray(worldMatrix);
        arObject.matrix.decompose(
          arObject.position,
          arObject.quaternion,
          arObject.scale
        );
        arObject.visible = true;
        setTrackedMarkers((prev) =>
          prev.includes(targetIndex) ? prev : [...prev, targetIndex]
        );
      } catch (e) {
        console.warn("matrix apply failed", e);
      }
    } else if (!worldMatrix && arObject) {
      arObject.visible = false;
      setTrackedMarkers((prev) => prev.filter((idx) => idx !== targetIndex));
    }
  };

  // ARオブジェクト追加
  const addARObjects = (scene: THREE.Scene, dimensions: [number, number][]) => {
    dimensions.forEach((dim, index) => {
      const [width] = dim;
      const geometry = new THREE.BoxGeometry(
        width * 0.5,
        width * 0.5,
        width * 0.5
      );
      const material = new THREE.MeshNormalMaterial();
      const cube = new THREE.Mesh(geometry, material);
      cube.name = `marker_${index}`;
      cube.position.set(0, 0, width * 0.25);
      cube.matrixAutoUpdate = false;
      cube.visible = false;
      cube.matrix.identity();
      scene.add(cube);
    });
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopRenderLoop();
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
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100vh" }}
    >
      <Webcam
        ref={webcamRef}
        audio={false}
        videoConstraints={videoConstraints}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {/* three renderer canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
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
    </div>
  );
};
