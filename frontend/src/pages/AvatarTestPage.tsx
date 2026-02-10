/**
 * VRMアバター テストページ
 * 3Dモデルの読み込みと表情変化を確認するためのシンプルなテストページ
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import {
  Box,
  Button,
  ButtonGroup,
  Typography,
  CircularProgress,
  Alert,
  Slider,
  Stack,
  Divider,
  Chip,
} from '@mui/material';
import VRMLoader from '../components/avatar/VRMLoader';
import ExpressionController from '../components/avatar/ExpressionController';
import AnimationController from '../components/avatar/AnimationController';
import LipSyncController from '../components/avatar/LipSyncController';
import { EmotionState } from '../types/index';
import { VRMExpressionName } from '../types/avatar';

// VRMファイルのパス（publicディレクトリから配信）
const DEFAULT_MODEL_URL = '/models/avatars/default_girl1.vrm';

const CAMERA_CONFIG = {
  fov: 20,
  near: 0.1,
  far: 100,
  position: { x: 0, y: 1.35, z: 1.0 },
  lookAt: { x: 0, y: 1.35, z: 0 },
};

const EMOTIONS: { label: string; value: EmotionState; emoji: string }[] = [
  { label: '怒り', value: 'angry', emoji: '😡' },
  { label: '不満', value: 'annoyed', emoji: '😒' },
  { label: '中立', value: 'neutral', emoji: '😐' },
  { label: '満足', value: 'satisfied', emoji: '🙂' },
  { label: '喜び', value: 'happy', emoji: '😄' },
];

const VRM_EXPRESSIONS: { label: string; value: VRMExpressionName }[] = [
  { label: 'Happy', value: 'happy' },
  { label: 'Angry', value: 'angry' },
  { label: 'Sad', value: 'sad' },
  { label: 'Relaxed', value: 'relaxed' },
  { label: 'Neutral', value: 'neutral' },
];

// Phase 2: Visemeテスト用の母音ボタン定義
const VOWEL_SHAPES: { label: string; blendShape: string; emoji: string }[] = [
  { label: 'あ (aa)', blendShape: 'aa', emoji: '👄' },
  { label: 'い (ih)', blendShape: 'ih', emoji: '😬' },
  { label: 'う (ou)', blendShape: 'ou', emoji: '😗' },
  { label: 'え (ee)', blendShape: 'ee', emoji: '😁' },
  { label: 'お (oh)', blendShape: 'oh', emoji: '😮' },
  { label: '閉口 (sil)', blendShape: '', emoji: '😶' },
];

// Phase 2: directEmotion用の感情定義（EmotionState型に準拠）
const DIRECT_EMOTIONS: { label: string; value: EmotionState; emoji: string }[] = [
  { label: 'Happy', value: 'happy', emoji: '😊' },
  { label: 'Satisfied', value: 'satisfied', emoji: '🙂' },
  { label: 'Neutral', value: 'neutral', emoji: '😐' },
  { label: 'Annoyed', value: 'annoyed', emoji: '😒' },
  { label: 'Angry', value: 'angry', emoji: '😠' },
];

// Phase 2: Viseme自動シーケンス（「こんにちは」のシミュレーション）
const SAMPLE_VISEME_SEQUENCE = [
  { time: 0, type: 'viseme', value: 'k' },
  { time: 100, type: 'viseme', value: 'o' },
  { time: 250, type: 'viseme', value: 'N' },
  { time: 400, type: 'viseme', value: 'n' },
  { time: 500, type: 'viseme', value: 'i' },
  { time: 650, type: 'viseme', value: 't' },
  { time: 750, type: 'viseme', value: 'i' },
  { time: 900, type: 'viseme', value: 'w' },
  { time: 1050, type: 'viseme', value: 'a' },
  { time: 1300, type: 'viseme', value: 'sil' },
];

const AvatarTestPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const vrmLoaderRef = useRef<VRMLoader | null>(null);
  const expressionCtrlRef = useRef<ExpressionController | null>(null);
  const animationCtrlRef = useRef<AnimationController | null>(null);
  const lipSyncCtrlRef = useRef<LipSyncController | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const cleanupTimerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionState>('neutral');
  const [availableExpressions, setAvailableExpressions] = useState<string[]>([]);
  const [directMode, setDirectMode] = useState(false);
  const [directExpression, setDirectExpression] = useState<string>('neutral');
  const [directIntensity, setDirectIntensity] = useState(0.8);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingTimeRef = useRef(0);

  // Phase 2: 追加状態
  const [currentVowel, setCurrentVowel] = useState<string>('');
  const [isVisemePlaying, setIsVisemePlaying] = useState(false);
  const [directEmotionMode, setDirectEmotionMode] = useState(false);
  const [selectedDirectEmotion, setSelectedDirectEmotion] = useState<EmotionState>('neutral');
  const [currentModelUrl] = useState<string>(DEFAULT_MODEL_URL);

  // レンダリングループ（Refで保持）
  const renderLoopRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    renderLoopRef.current = () => {
      const deltaTime = clockRef.current.getDelta();

      if (!directMode) {
        expressionCtrlRef.current?.update(deltaTime);
      }
      animationCtrlRef.current?.update(deltaTime);

      // Phase 2: LipSyncControllerのvisemeベース更新
      lipSyncCtrlRef.current?.update(deltaTime);

      // 発話シミュレーション: サイン波で口パクを再現（visemeモードでない場合のみ）
      if (isSpeaking && !isVisemePlaying && vrmRef.current?.expressionManager) {
        speakingTimeRef.current += deltaTime;
        // 複数のサイン波を合成してより自然な口の動きを再現
        const t = speakingTimeRef.current;
        const mouthOpen =
          Math.abs(Math.sin(t * 8.0)) * 0.4 +
          Math.abs(Math.sin(t * 12.5)) * 0.2 +
          Math.abs(Math.sin(t * 3.0)) * 0.15;
        vrmRef.current.expressionManager.setValue('aa', Math.min(mouthOpen, 0.8));
      } else if (!isSpeaking && vrmRef.current?.expressionManager) {
        // 発話停止時は口を閉じる
        speakingTimeRef.current = 0;
        vrmRef.current.expressionManager.setValue('aa', 0);
      }

      if (vrmRef.current) {
        vrmRef.current.update(deltaTime);
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animFrameRef.current = requestAnimationFrame(renderLoopRef.current!);
    };
  }, [directMode, isSpeaking, isVisemePlaying]);

  // リサイズ処理
  const handleResize = useCallback(() => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(w, h);
  }, []);

  // 全リソースクリーンアップ
  const cleanup = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    expressionCtrlRef.current?.dispose();
    expressionCtrlRef.current = null;
    animationCtrlRef.current?.dispose();
    animationCtrlRef.current = null;
    lipSyncCtrlRef.current?.dispose();
    lipSyncCtrlRef.current = null;

    if (vrmRef.current && sceneRef.current) {
      sceneRef.current.remove(vrmRef.current.scene);
      vrmRef.current.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else {
            object.material?.dispose();
          }
        }
      });
    }
    vrmRef.current = null;
    vrmLoaderRef.current?.dispose();
    vrmLoaderRef.current = null;

    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    if (sceneRef.current) {
      sceneRef.current.clear();
      sceneRef.current = null;
    }
    cameraRef.current = null;
  }, []);

  // 初期化（StrictMode二重マウント対策付き）
  useEffect(() => {
    // 前回の遅延クリーンアップをキャンセル（StrictMode再マウント時）
    if (cleanupTimerRef.current !== null) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    // 既にRendererが存在する場合はスキップ（StrictMode再マウント対策）
    if (rendererRef.current) {
      if (animFrameRef.current === null && renderLoopRef.current) {
        animFrameRef.current = requestAnimationFrame(renderLoopRef.current);
      }
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        if (animFrameRef.current !== null) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        const currentRenderer = rendererRef.current;
        cleanupTimerRef.current = window.setTimeout(() => {
          if (rendererRef.current === currentRenderer) {
            cleanup();
          }
        }, 50);
      };
    }

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // シーン
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // カメラ
    const camera = new THREE.PerspectiveCamera(CAMERA_CONFIG.fov, w / h, CAMERA_CONFIG.near, CAMERA_CONFIG.far);
    camera.position.set(CAMERA_CONFIG.position.x, CAMERA_CONFIG.position.y, CAMERA_CONFIG.position.z);
    camera.lookAt(CAMERA_CONFIG.lookAt.x, CAMERA_CONFIG.lookAt.y, CAMERA_CONFIG.lookAt.z);
    cameraRef.current = camera;

    // レンダラー
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // ライト
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(0.5, 1.5, 1);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-1, 1, 0.5);
    scene.add(fillLight);

    clockRef.current.start();

    // VRM読み込み
    const loader = new VRMLoader();
    vrmLoaderRef.current = loader;

    loader.load(currentModelUrl, (progress) => {
      setLoadProgress(Math.round(progress));
    }).then((vrm) => {
      // クリーンアップ済みの場合は読み込んだリソースを破棄
      if (!sceneRef.current) {
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

      // 利用可能な表情を取得
      if (vrm.expressionManager) {
        const exprs = vrm.expressionManager.expressions.map(e => e.expressionName);
        setAvailableExpressions(exprs);
      }

      // コントローラー初期化
      expressionCtrlRef.current = new ExpressionController(vrm);
      animationCtrlRef.current = new AnimationController(vrm);
      animationCtrlRef.current.startIdleAnimations();
      lipSyncCtrlRef.current = new LipSyncController(vrm);

      setLoading(false);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'VRM読み込みに失敗しました');
      setLoading(false);
    });

    // レンダリングループ開始
    if (renderLoopRef.current) {
      animFrameRef.current = requestAnimationFrame(renderLoopRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      // StrictModeの偽アンマウント対策: 遅延クリーンアップ
      const currentRenderer = rendererRef.current;
      cleanupTimerRef.current = window.setTimeout(() => {
        if (rendererRef.current === currentRenderer) {
          cleanup();
        }
      }, 50);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時に1回だけ実行
  }, []);

  // Phase 2: アバター切り替え時のモデルリロード
  useEffect(() => {
    // 初回マウント時はスキップ（初期化useEffectで処理済み）
    if (!vrmLoaderRef.current || !sceneRef.current || loading) return;

    // 既存VRMを削除
    if (vrmRef.current) {
      sceneRef.current.remove(vrmRef.current.scene);
      vrmRef.current.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else {
            object.material?.dispose();
          }
        }
      });
      vrmRef.current = null;
    }

    // コントローラーをリセット
    expressionCtrlRef.current?.dispose();
    expressionCtrlRef.current = null;
    animationCtrlRef.current?.dispose();
    animationCtrlRef.current = null;
    lipSyncCtrlRef.current?.dispose();
    lipSyncCtrlRef.current = null;

    setLoading(true);
    setLoadProgress(0);

    const loader = new VRMLoader();
    vrmLoaderRef.current = loader;

    loader.load(currentModelUrl, (progress) => {
      setLoadProgress(Math.round(progress));
    }).then((vrm) => {
      if (!sceneRef.current) return;

      vrmRef.current = vrm;
      sceneRef.current.add(vrm.scene);

      if (vrm.expressionManager) {
        const exprs = vrm.expressionManager.expressions.map(e => e.expressionName);
        setAvailableExpressions(exprs);
      }

      expressionCtrlRef.current = new ExpressionController(vrm);
      animationCtrlRef.current = new AnimationController(vrm);
      animationCtrlRef.current.startIdleAnimations();
      lipSyncCtrlRef.current = new LipSyncController(vrm);

      // 現在の感情状態を再適用
      expressionCtrlRef.current.setEmotion(currentEmotion);

      setLoading(false);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'VRM読み込みに失敗しました');
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentModelUrl変更時のみ実行
  }, [currentModelUrl]);

  // directMode変更時にレンダリングループを再起動
  useEffect(() => {
    if (loading || !rendererRef.current) return;
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (renderLoopRef.current) {
      animFrameRef.current = requestAnimationFrame(renderLoopRef.current);
    }
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [loading, directMode, isSpeaking, isVisemePlaying]);

  // 感情状態の変更（ExpressionController経由）
  const handleEmotionChange = useCallback((emotion: EmotionState) => {
    setCurrentEmotion(emotion);
    setDirectMode(false);
    expressionCtrlRef.current?.setEmotion(emotion);
  }, []);

  // VRM表情の直接操作
  const handleDirectExpression = useCallback((exprName: string, intensity: number) => {
    const vrm = vrmRef.current;
    if (!vrm?.expressionManager) return;

    setDirectMode(true);
    setDirectExpression(exprName);
    setDirectIntensity(intensity);

    // すべての表情をリセット
    for (const expr of vrm.expressionManager.expressions) {
      vrm.expressionManager.setValue(expr.expressionName, 0);
    }

    // 指定した表情を適用
    if (exprName !== 'neutral') {
      vrm.expressionManager.setValue(exprName, intensity);
    }
  }, []);

  // 複数表情のブレンド適用
  const handleBlendPreset = useCallback((blend: Record<string, number>) => {
    const vrm = vrmRef.current;
    if (!vrm?.expressionManager) return;

    setDirectMode(true);
    setDirectExpression('blend');

    // すべての表情をリセット
    for (const expr of vrm.expressionManager.expressions) {
      vrm.expressionManager.setValue(expr.expressionName, 0);
    }

    // ブレンド適用
    for (const [name, value] of Object.entries(blend)) {
      vrm.expressionManager.setValue(name, value);
    }
  }, []);

  // Phase 2: 母音ブレンドシェイプの直接操作
  const handleVowelShape = useCallback((blendShape: string) => {
    const vrm = vrmRef.current;
    if (!vrm?.expressionManager) return;

    setCurrentVowel(blendShape);

    // すべての母音をリセット
    const vowelShapes = ['aa', 'ih', 'ou', 'ee', 'oh'];
    for (const shape of vowelShapes) {
      vrm.expressionManager.setValue(shape, 0);
    }

    // 指定した母音を適用
    if (blendShape) {
      vrm.expressionManager.setValue(blendShape, 0.8);
    }
  }, []);

  // Phase 2: Visemeシーケンス自動再生
  const handleVisemeSequence = useCallback(() => {
    if (!lipSyncCtrlRef.current) return;

    setIsVisemePlaying(true);
    lipSyncCtrlRef.current.setVisemeData(SAMPLE_VISEME_SEQUENCE);
    lipSyncCtrlRef.current.startVisemePlayback();

    // シーケンス終了後にフラグをリセット
    const duration = SAMPLE_VISEME_SEQUENCE[SAMPLE_VISEME_SEQUENCE.length - 1].time + 500;
    setTimeout(() => {
      setIsVisemePlaying(false);
      setCurrentVowel('');
    }, duration);
  }, []);

  // Phase 2: directEmotion切り替え
  const handleDirectEmotion = useCallback((emotion: EmotionState) => {
    setSelectedDirectEmotion(emotion);
    setDirectEmotionMode(true);
    setDirectMode(false);

    // ExpressionControllerで感情を適用
    expressionCtrlRef.current?.setEmotion(emotion);
  }, []);

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', p: 2, gap: 2 }}>
      {/* 3D表示エリア */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          position: 'relative',
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          minHeight: 400,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
          aria-label="VRMモデル テスト表示エリア"
          role="img"
        />

        {/* ローディング */}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: 'rgba(255,255,255,0.9)',
            }}
          >
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              VRMモデル読み込み中... {loadProgress}%
            </Typography>
          </Box>
        )}

        {/* エラー */}
        {error && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', p: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}
      </Box>

      {/* コントロールパネル */}
      <Box sx={{ width: 320, flexShrink: 0, overflow: 'auto' }}>
        <Stack spacing={3}>
          <Typography variant="h6">VRM表情テスト</Typography>

          {/* 感情状態ボタン（ExpressionController経由） */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              発話シミュレーション
            </Typography>
            <Button
              variant={isSpeaking ? 'contained' : 'outlined'}
              color={isSpeaking ? 'error' : 'primary'}
              onClick={() => setIsSpeaking((prev) => !prev)}
              fullWidth
              size="small"
              aria-pressed={isSpeaking}
            >
              {isSpeaking ? '🔊 発話停止' : '🗣️ 発話開始'}
            </Button>
          </Box>

          {/* 怒りブレンドプリセット */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              怒りブレンド（複数表情の組み合わせ）
            </Typography>
            <Stack spacing={1}>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => handleBlendPreset({ angry: 1.0 })}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                😡 angry のみ (1.0)
              </Button>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => handleBlendPreset({ angry: 1.0, lookDown: 0.4 })}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                😡 angry + lookDown（睨み）
              </Button>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => handleBlendPreset({ angry: 1.0, blink: 0.3 })}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                😡 angry + blink（目を細める）
              </Button>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => handleBlendPreset({ angry: 1.0, aa: 0.3 })}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                😡 angry + aa（口を開ける）
              </Button>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => handleBlendPreset({ angry: 1.0, lookDown: 0.3, blink: 0.25 })}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                😡 angry + lookDown + blink（複合）
              </Button>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => handleBlendPreset({ angry: 1.0, lookDown: 0.3, blink: 0.25, aa: 0.2 })}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                😡 angry + lookDown + blink + aa（全部盛り）
              </Button>
            </Stack>
          </Box>

          {/* 感情状態ボタン（ExpressionController経由） */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              感情状態（EmotionState経由）
            </Typography>
            <Stack spacing={1}>
              {EMOTIONS.map(({ label, value, emoji }) => (
                <Button
                  key={value}
                  variant={!directMode && currentEmotion === value ? 'contained' : 'outlined'}
                  onClick={() => handleEmotionChange(value)}
                  fullWidth
                  size="small"
                >
                  {emoji} {label} ({value})
                </Button>
              ))}
            </Stack>
          </Box>

          {/* VRM表情の直接操作 */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              VRM表情（直接操作）
            </Typography>
            <ButtonGroup orientation="vertical" fullWidth size="small">
              {VRM_EXPRESSIONS.map(({ label, value }) => (
                <Button
                  key={value}
                  variant={directMode && directExpression === value ? 'contained' : 'outlined'}
                  onClick={() => handleDirectExpression(value, directIntensity)}
                >
                  {label}
                </Button>
              ))}
            </ButtonGroup>

            <Box sx={{ mt: 2 }}>
              <Typography variant="caption">強度: {directIntensity.toFixed(2)}</Typography>
              <Slider
                value={directIntensity}
                min={0}
                max={1}
                step={0.05}
                onChange={(_, val) => {
                  const v = val as number;
                  setDirectIntensity(v);
                  if (directMode) {
                    handleDirectExpression(directExpression, v);
                  }
                }}
                size="small"
                aria-label="表情の強度"
              />
            </Box>
          </Box>

          {/* モデルで利用可能な表情一覧 */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              利用可能な表情（モデル内）
            </Typography>
            {availableExpressions.length > 0 ? (
              <Stack spacing={0.5}>
                {availableExpressions.map((expr) => (
                  <Button
                    key={expr}
                    variant="text"
                    size="small"
                    onClick={() => handleDirectExpression(expr, directIntensity)}
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                  >
                    {expr}
                  </Button>
                ))}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {loading ? '読み込み中...' : '表情が見つかりません'}
              </Typography>
            )}
          </Box>

          {/* Phase 2 セクション区切り */}
          <Divider>
            <Chip label="Phase 2" color="primary" size="small" />
          </Divider>

          {/* Phase 2: Viseme リップシンクテスト */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Viseme リップシンク
            </Typography>
            <Stack spacing={1}>
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {VOWEL_SHAPES.map(({ label, blendShape, emoji }) => (
                  <Button
                    key={label}
                    variant={currentVowel === blendShape ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => handleVowelShape(blendShape)}
                    sx={{ textTransform: 'none', minWidth: 'auto', px: 1.5 }}
                  >
                    {emoji} {label}
                  </Button>
                ))}
              </Stack>
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                fullWidth
                onClick={handleVisemeSequence}
                disabled={isVisemePlaying}
              >
                {isVisemePlaying ? '🔊 再生中...' : '▶️ 「こんにちは」再生'}
              </Button>
            </Stack>
          </Box>

          {/* Phase 2: directEmotion テスト */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              directEmotion（AI感情分析）
            </Typography>
            <Stack spacing={1}>
              {DIRECT_EMOTIONS.map(({ label, value, emoji }) => (
                <Button
                  key={value}
                  variant={directEmotionMode && selectedDirectEmotion === value ? 'contained' : 'outlined'}
                  color="secondary"
                  onClick={() => handleDirectEmotion(value)}
                  fullWidth
                  size="small"
                >
                  {emoji} {label} ({value})
                </Button>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
};

export default AvatarTestPage;
