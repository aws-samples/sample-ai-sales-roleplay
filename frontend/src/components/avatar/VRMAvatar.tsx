/**
 * VRMアバターコンポーネント
 * Three.jsシーンの管理とVRMモデルのレンダリングを担当
 */
import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import { VRMAvatarProps } from '../../types/avatar';
import { EmotionState } from '../../types/index';
import VRMLoader from './VRMLoader';
import ExpressionController from './ExpressionController';
import LipSyncController from './LipSyncController';
import AnimationController from './AnimationController';

/**
 * 目標フレームレート（30fps）
 */
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

/**
 * カメラ設定 - 顔全体が見える位置
 */
const CAMERA_CONFIG = {
  fov: 20,
  near: 0.1,
  far: 100,
  position: { x: 0, y: 1.35, z: 1.0 },
  lookAt: { x: 0, y: 1.35, z: 0 },
};

/**
 * ライト設定 - 顔を明るく照らす
 */
const LIGHT_CONFIG = {
  ambient: { color: 0xffffff, intensity: 0.8 },
  directional: { color: 0xffffff, intensity: 1.0, position: { x: 0.5, y: 1.5, z: 1 } },
  fill: { color: 0xffffff, intensity: 0.4, position: { x: -1, y: 1, z: 0.5 } },
};

/**
 * VRMアバターコンポーネント
 * Three.jsを使用してVRMモデルをレンダリングする
 */
const VRMAvatar: React.FC<VRMAvatarProps> = ({
  modelUrl,
  emotion,
  isSpeaking,
  visemeData,
  directEmotion,
  gesture,
  onLoad,
  onError,
}) => {
  // DOM Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Three.js Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const vrmLoaderRef = useRef<VRMLoader | null>(null);

  // コントローラー Refs
  const expressionControllerRef = useRef<ExpressionController | null>(null);
  const lipSyncControllerRef = useRef<LipSyncController | null>(null);
  const animationControllerRef = useRef<AnimationController | null>(null);

  // アニメーション Refs
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const isMountedRef = useRef<boolean>(false);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 状態追跡 Refs
  const previousEmotionRef = useRef<EmotionState>(emotion);
  const previousIsSpeakingRef = useRef<boolean>(isSpeaking);

  // コールバックをRefで保持（useEffect依存を避ける）
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  onLoadRef.current = onLoad;
  onErrorRef.current = onError;

  // 初期値をRefで保持
  const modelUrlRef = useRef<string>(modelUrl);
  const initialEmotionRef = useRef<EmotionState>(emotion);
  const initialIsSpeakingRef = useRef<boolean>(isSpeaking);

  /**
   * レンダリングループ（Refで保持して自己参照を回避）
   */
  const renderLoopRef = useRef<() => void>();

  useEffect(() => {
    renderLoopRef.current = () => {
      const currentTime = performance.now();
      const elapsed = currentTime - lastFrameTimeRef.current;

      if (elapsed >= FRAME_INTERVAL) {
        lastFrameTimeRef.current = currentTime - (elapsed % FRAME_INTERVAL);
        const deltaTime = clockRef.current.getDelta();

        // コントローラーの更新（vrm.update()より先に実行）
        expressionControllerRef.current?.update(deltaTime);
        lipSyncControllerRef.current?.update(deltaTime);
        animationControllerRef.current?.update(deltaTime);

        // VRMの更新
        if (vrmRef.current) {
          vrmRef.current.update(deltaTime);
        }

        // レンダリング
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderLoopRef.current!);
    };
  }, []);

  /**
   * リサイズハンドラー
   * コンテナサイズが0の場合はスキップ（レイアウト未完了時の対策）
   */
  const handleResize = useCallback(() => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    if (width === 0 || height === 0) return;
    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
  }, []);

  /**
   * VRMリソースを完全に解放する
   */
  const disposeVRM = useCallback(() => {
    if (vrmRef.current && sceneRef.current) {
      sceneRef.current.remove(vrmRef.current.scene);
      vrmRef.current.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else if (object.material) {
            object.material.dispose();
          }
        }
      });
    }
    vrmRef.current = null;
  }, []);

  /**
   * 全リソースをクリーンアップする
   */
  const cleanup = useCallback(() => {
    // アニメーションフレームをキャンセル
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // コントローラーを解放
    expressionControllerRef.current?.dispose();
    expressionControllerRef.current = null;
    lipSyncControllerRef.current?.dispose();
    lipSyncControllerRef.current = null;
    animationControllerRef.current?.dispose();
    animationControllerRef.current = null;

    // VRMリソースを解放
    disposeVRM();
    vrmLoaderRef.current?.dispose();
    vrmLoaderRef.current = null;

    // Three.jsリソースを解放
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    if (sceneRef.current) {
      sceneRef.current.clear();
      sceneRef.current = null;
    }

    cameraRef.current = null;
  }, [disposeVRM]);

  /**
   * メインの初期化・クリーンアップ useEffect
   * 依存配列を空にして、マウント時に1回だけ実行
   *
   * StrictMode対策:
   * React StrictModeでは マウント→クリーンアップ→再マウント の順で実行される。
   * Three.js/VRMリソースの即時破棄→再生成はコストが高いため、以下の戦略で回避する:
   * - クリーンアップではsetTimeout(0)で遅延破棄をスケジュール
   * - 再マウント時にclearTimeoutで遅延破棄をキャンセル
   * - rendererRef.currentが残っていれば初期化をスキップ
   * - isMountedRefで非同期処理(loadModel)完了時のアンマウント判定を行う
   */
  useEffect(() => {
    isMountedRef.current = true;

    // StrictMode再マウント時: 遅延クリーンアップをキャンセル
    if (cleanupTimerRef.current !== null) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    // 既にRendererが存在する場合はスキップ（StrictMode再マウント対策）
    if (rendererRef.current) {
      if (animationFrameRef.current === null && renderLoopRef.current) {
        animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);
      }
      // ResizeObserverでコンテナサイズ変化を検知
      const container = containerRef.current;
      let resizeObserver: ResizeObserver | null = null;
      if (container) {
        resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(container);
      }
      return () => {
        isMountedRef.current = false;
        resizeObserver?.disconnect();
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // === シーン初期化 ===
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    sceneRef.current = scene;

    // カメラ
    const camera = new THREE.PerspectiveCamera(
      CAMERA_CONFIG.fov, width / height, CAMERA_CONFIG.near, CAMERA_CONFIG.far
    );
    camera.position.set(CAMERA_CONFIG.position.x, CAMERA_CONFIG.position.y, CAMERA_CONFIG.position.z);
    camera.lookAt(CAMERA_CONFIG.lookAt.x, CAMERA_CONFIG.lookAt.y, CAMERA_CONFIG.lookAt.z);
    cameraRef.current = camera;

    // レンダラー
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // ライト
    const ambientLight = new THREE.AmbientLight(LIGHT_CONFIG.ambient.color, LIGHT_CONFIG.ambient.intensity);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(LIGHT_CONFIG.directional.color, LIGHT_CONFIG.directional.intensity);
    directionalLight.position.set(
      LIGHT_CONFIG.directional.position.x, LIGHT_CONFIG.directional.position.y, LIGHT_CONFIG.directional.position.z
    );
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(LIGHT_CONFIG.fill.color, LIGHT_CONFIG.fill.intensity);
    fillLight.position.set(LIGHT_CONFIG.fill.position.x, LIGHT_CONFIG.fill.position.y, LIGHT_CONFIG.fill.position.z);
    scene.add(fillLight);

    // クロック開始
    clockRef.current.start();

    // === VRMモデル読み込み ===
    const loadModel = async () => {
      if (!sceneRef.current || !modelUrlRef.current) return;

      try {
        const loader = new VRMLoader();
        vrmLoaderRef.current = loader;

        const vrm = await loader.load(modelUrlRef.current, () => { });

        // クリーンアップ済みの場合は読み込んだリソースを破棄
        if (!isMountedRef.current) {
          vrm.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry?.dispose();
              if (Array.isArray(object.material)) {
                object.material.forEach((mat) => mat.dispose());
              } else if (object.material) {
                object.material.dispose();
              }
            }
          });
          return;
        }

        vrmRef.current = vrm;
        sceneRef.current.add(vrm.scene);

        // コントローラーを初期化
        expressionControllerRef.current = new ExpressionController(vrm);
        lipSyncControllerRef.current = new LipSyncController(vrm);
        animationControllerRef.current = new AnimationController(vrm);

        // AnimationControllerにExpressionControllerの参照を設定（blink競合回避）
        animationControllerRef.current.setExpressionController(expressionControllerRef.current);

        // 初期感情状態を設定
        expressionControllerRef.current.setEmotion(initialEmotionRef.current);

        // 待機アニメーション開始
        animationControllerRef.current.startIdleAnimations();

        // 発話中の場合はリップシンクを接続
        if (initialIsSpeakingRef.current) {
          lipSyncControllerRef.current.connectToAudioService();
        }

        // 読み込み完了コールバック
        onLoadRef.current?.();
      } catch (error) {
        console.error('VRMモデル読み込みエラー:', error);
        const errorObj = error instanceof Error
          ? error
          : new Error('VRMモデルの読み込みに失敗しました');
        onErrorRef.current?.(errorObj);
      }
    };

    loadModel();

    // レンダリングループ開始
    if (renderLoopRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderLoopRef.current);
    }

    // ResizeObserverでコンテナサイズ変化を検知（window.resizeより正確）
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    // クリーンアップ
    return () => {
      isMountedRef.current = false;
      resizeObserver.disconnect();

      // アニメーションフレームをキャンセル
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // StrictMode対策: setTimeout(0)で遅延クリーンアップをスケジュール。
      // 再マウント時にclearTimeoutでキャンセルされるため、StrictModeの偽アンマウントでは
      // リソースが破棄されず、実際のアンマウント時のみcleanup()が実行される。
      const currentRenderer = rendererRef.current;
      cleanupTimerRef.current = setTimeout(() => {
        if (rendererRef.current === currentRenderer) {
          cleanup();
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時に1回だけ実行。rendererRef.currentのガードでStrictModeの二重初期化を防止
  }, []);

  // 感情状態の変更を監視
  // ※ VRMAvatarContainerが既にdirectEmotionとメトリクスを統合した
  //    currentEmotionをemotion propとして渡しているため、ここでは
  //    directEmotionによる再オーバーライドは行わない
  useEffect(() => {
    if (emotion !== previousEmotionRef.current) {
      expressionControllerRef.current?.setEmotion(emotion);
      previousEmotionRef.current = emotion;
    }
  }, [emotion]);

  // visemeデータの変更を監視
  useEffect(() => {
    if (visemeData && visemeData.length > 0 && lipSyncControllerRef.current) {
      lipSyncControllerRef.current.setVisemeData(visemeData as Array<{ time: number; type: string; value: string }>);
      lipSyncControllerRef.current.startVisemePlayback();
    }
  }, [visemeData]);

  // 発話状態の変更を監視
  useEffect(() => {
    if (isSpeaking !== previousIsSpeakingRef.current) {
      if (isSpeaking) {
        lipSyncControllerRef.current?.connectToAudioService();
      } else {
        lipSyncControllerRef.current?.disconnect();
      }
      // AnimationControllerに発話状態を通知（アイドルモーション抑制用）
      animationControllerRef.current?.setIsSpeaking(isSpeaking);
      previousIsSpeakingRef.current = isSpeaking;
    }
  }, [isSpeaking]);

  // ジェスチャーの変更を監視
  useEffect(() => {
    if (gesture && gesture !== 'none' && animationControllerRef.current) {
      animationControllerRef.current.triggerGesture(gesture);
    }
  }, [gesture]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
        aria-label="3Dアバター表示エリア"
        role="img"
      />
    </div>
  );
};

export default VRMAvatar;
