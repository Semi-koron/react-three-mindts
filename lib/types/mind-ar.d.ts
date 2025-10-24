declare module "mind-ar/src/image-target/controller" {
  import { OneEuroFilter } from "../libs/one-euro-filter";

  export class Controller {
    constructor(options: {
      inputWidth: number;
      inputHeight: number;
      onUpdate?: ((data: UpdateData) => void) | null;
      debugMode?: boolean;
      maxTrack?: number;
      warmupTolerance?: number | null;
      missTolerance?: number | null;
      filterMinCF?: number | null;
      filterBeta?: number | null;
    });

    // 入力画像のサイズ
    inputWidth: number;
    inputHeight: number;

    // トラッキング設定
    maxTrack: number; // 同時追跡可能な最大マーカー数
    filterMinCF: number; // OneEuroFilterの最小カットオフ周波数
    filterBeta: number; // OneEuroFilterのベータ値
    warmupTolerance: number; // 表示開始までの連続検出フレーム数
    missTolerance: number; // 非表示にするまでの連続未検出フレーム数

    // コンポーネント
    cropDetector: CropDetector; // 特徴点検出器
    inputLoader: InputLoader; // 入力画像ローダー
    tracker: Tracker | null; // トラッキングエンジン
    worker: Worker; // マッチング処理用Webワーカー

    // マーカー情報
    markerDimensions: [number, number][] | null; // 各マーカーの[幅, 高さ]

    // カメラパラメータ
    projectionTransform: number[][]; // カメラ内部パラメータ行列(3x3)
    projectionMatrix: number[]; // OpenGL投影行列(16要素)

    // 状態管理
    processingVideo: boolean; // ビデオ処理中フラグ
    interestedTargetIndex: number; // 特定マーカーのみ追跡する場合のインデックス(-1で全て)
    trackingStates: TrackingState[]; // 各マーカーの追跡状態

    // コールバック
    onUpdate: ((data: UpdateData) => void) | null;
    debugMode: boolean;

    // ワーカー通信用
    workerMatchDone: ((data: any) => void) | null;
    workerTrackDone: ((data: any) => void) | null;

    // メソッド
    showTFStats(): void;
    addImageTargets(fileURL: string): Promise<{
      dimensions: [number, number][];
      matchingDataList: any[];
      trackingDataList: any[];
    }>;
    addImageTargetsFromBuffer(buffer: ArrayBuffer): {
      dimensions: [number, number][];
      matchingDataList: any[];
      trackingDataList: any[];
    };
    dispose(): void;
    dummyRun(
      input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageData
    ): void;
    getProjectionMatrix(): number[];
    getRotatedZ90Matrix(m: number[]): number[];
    getWorldMatrix(
      modelViewTransform: number[][],
      targetIndex: number
    ): number[];
    processVideo(
      input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageData
    ): void;
    stopProcessVideo(): void;
    detect(
      input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageData
    ): Promise<{
      featurePoints: any[];
      debugExtra?: any;
    }>;
    match(
      featurePoints: any[],
      targetIndex: number
    ): Promise<{
      modelViewTransform: number[][] | null;
      debugExtra?: any;
    }>;
    track(
      input:
        | HTMLVideoElement
        | HTMLImageElement
        | HTMLCanvasElement
        | ImageData,
      modelViewTransform: number[][],
      targetIndex: number
    ): Promise<{
      worldCoords: number[][];
      screenCoords: number[][];
    }>;
    trackUpdate(
      modelViewTransform: number[][],
      trackFeatures: {
        worldCoords: number[][];
        screenCoords: number[][];
      }
    ): Promise<number[][] | null>;
  }

  interface TrackingState {
    showing: boolean; // ユーザーに表示中か
    isTracking: boolean; // 現在トラッキング中か
    currentModelViewTransform: number[][] | null; // 現在のモデルビュー変換行列
    trackCount: number; // 連続トラッキング成功回数
    trackMiss: number; // 連続トラッキング失敗回数
    filter: OneEuroFilter; // 座標平滑化フィルター
    trackingMatrix?: number[]; // フィルター適用後の行列
  }

  interface UpdateData {
    type: "updateMatrix" | "processDone";
    targetIndex?: number;
    worldMatrix?: number[] | null;
  }

  class CropDetector {
    constructor(inputWidth: number, inputHeight: number, debugMode: boolean);
  }

  class InputLoader {
    constructor(inputWidth: number, inputHeight: number);
  }

  class Tracker {
    constructor(
      dimensions: [number, number][],
      trackingDataList: any[],
      projectionTransform: number[][],
      inputWidth: number,
      inputHeight: number,
      debugMode: boolean
    );
  }
}
