/**
 * VRMアバターコンテナコンポーネント
 * EmojiFeedbackContainerと同等のインターフェースを提供し、
 * WebGLサポートチェック、エラーハンドリング、発話インジケーターを含む
 */
import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { VolumeUp as VolumeUpIcon, Error as ErrorIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { VRMAvatarContainerProps } from '../../types/avatar';
import { VisemeData } from '../../types/avatar';
import { EmotionState } from '../../types/index';
import { calculateEmotionState } from '../../utils/emotionUtils';
import { useAvatar } from './AvatarContext';
import VRMAvatar from './VRMAvatar';

/**
 * WebGLサポートをチェックする（初期化時に一度だけ実行）
 */
const checkWebGLSupport = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return gl !== null;
  } catch {
    return false;
  }
};

// WebGLサポート状態をモジュールレベルでキャッシュ
const webGLSupported = checkWebGLSupport();

/**
 * VRMアバターコンテナコンポーネント
 * EmojiFeedbackContainerと同等のインターフェースを提供
 */
const VRMAvatarContainer: React.FC<VRMAvatarContainerProps> = ({
  avatarId,
  angerLevel,
  trustLevel,
  progressLevel,
  isSpeaking,
  directEmotion,
  onEmotionChange,
}) => {
  const { t } = useTranslation();
  const { avatarInfo, isLoading: isContextLoading, error: contextError, loadAvatar, getDefaultAvatarId } = useAvatar();

  // ローカル状態
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [modelError, setModelError] = useState<Error | null>(null);
  const [previousEmotion, setPreviousEmotion] = useState<EmotionState>('neutral');
  const [visemeData, setVisemeData] = useState<VisemeData[] | undefined>(undefined);

  // 感情変更通知のフラグ（無限ループ防止）
  const emotionChangeNotifiedRef = useRef<EmotionState>('neutral');

  // アバターの読み込み
  useEffect(() => {
    const initializeAvatar = async () => {
      try {
        if (avatarId) {
          // 指定されたアバターIDを読み込み
          await loadAvatar(avatarId);
        } else {
          // デフォルトアバターを読み込み
          const defaultId = await getDefaultAvatarId();
          if (defaultId) {
            await loadAvatar(defaultId);
          }
        }
      } catch (error) {
        console.error('アバター初期化エラー:', error);
      }
    };

    initializeAvatar();
  }, [avatarId, loadAvatar, getDefaultAvatarId]);

  // 感情状態の計算（directEmotionが指定されていない場合のみ使用）
  const currentEmotion = useMemo<EmotionState>(() => {
    if (directEmotion) return directEmotion;
    return calculateEmotionState({
      angerLevel,
      trustLevel,
      progressLevel,
      previousEmotion,
    });
  }, [angerLevel, trustLevel, progressLevel, previousEmotion, directEmotion]);

  // visemeデータのCustomEventリスナー
  useEffect(() => {
    const handleVisemeData = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.visemes) {
        setVisemeData(customEvent.detail.visemes);
      }
    };
    window.addEventListener('visemeData', handleVisemeData);
    return () => {
      window.removeEventListener('visemeData', handleVisemeData);
    };
  }, []);

  // 感情状態の変更を通知（Refで重複通知を防止）
  useEffect(() => {
    if (currentEmotion !== emotionChangeNotifiedRef.current) {
      emotionChangeNotifiedRef.current = currentEmotion;
      // previousEmotionの更新は次のレンダリングサイクルで行う
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 意図的な設計: 感情状態の追跡に必要
      setPreviousEmotion(currentEmotion);
      onEmotionChange?.(currentEmotion);
    }
  }, [currentEmotion, onEmotionChange]);

  // モデル読み込み完了ハンドラー
  const handleModelLoad = useCallback(() => {
    setIsModelLoading(false);
    setModelError(null);
    console.log('VRMモデルの読み込みが完了しました');
  }, []);

  // モデル読み込みエラーハンドラー
  const handleModelError = useCallback((error: Error) => {
    setIsModelLoading(false);
    setModelError(error);
    console.error('VRMモデル読み込みエラー:', error);
  }, []);

  // モデルURLの取得
  const modelUrl = useMemo(() => {
    if (!avatarInfo?.modelPath) return null;
    // 相対パスの場合は/models/avatars/を付加
    if (avatarInfo.modelPath.startsWith('/')) {
      return avatarInfo.modelPath;
    }
    return `/models/avatars/${avatarInfo.modelPath}`;
  }, [avatarInfo]);

  // ローディング状態
  const isLoading = isContextLoading || isModelLoading;

  // エラー状態
  const error = contextError || modelError;

  // WebGLがサポートされていない場合
  if (!webGLSupported) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'grey.100',
          borderRadius: 1,
          p: 2,
        }}
        role="alert"
        aria-live="polite"
      >
        <ErrorIcon sx={{ fontSize: 48, color: 'warning.main', mb: 2 }} />
        <Typography variant="body1" color="text.secondary" textAlign="center">
          {t('avatar.webglNotSupported', 'お使いのブラウザはWebGLをサポートしていません。3Dアバターを表示するには、WebGL対応のブラウザをご使用ください。')}
        </Typography>
      </Box>
    );
  }

  // エラー表示
  if (error) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 2,
        }}
      >
        <Alert
          severity="error"
          sx={{ maxWidth: '100%' }}
          role="alert"
        >
          <Typography variant="body2">
            {t('avatar.loadError', 'アバターの読み込みに失敗しました')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {error.message}
          </Typography>
        </Alert>
      </Box>
    );
  }

  // ローディング表示
  if (isLoading || !modelUrl) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'grey.50',
        }}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <CircularProgress size={40} sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          {t('avatar.loading', 'アバターを読み込み中...')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      {/* アクセシビリティ対応のためのラベル */}
      <Typography
        id="avatar-label"
        sx={{ position: 'absolute', left: '-9999px' }}
      >
        {t('avatar.label', '3Dアバター表示エリア')}
      </Typography>

      <Typography
        id="avatar-description"
        sx={{ position: 'absolute', left: '-9999px' }}
      >
        {t('avatar.description', '現在の感情状態を3Dアバターで表現しています')}
      </Typography>

      {/* VRMアバター */}
      <Box
        sx={{
          width: '100%',
          height: '100%',
        }}
        aria-labelledby="avatar-label"
        aria-describedby="avatar-description"
      >
        <VRMAvatar
          modelUrl={modelUrl}
          emotion={currentEmotion}
          isSpeaking={isSpeaking}
          visemeData={visemeData}
          directEmotion={directEmotion}
          onLoad={handleModelLoad}
          onError={handleModelError}
        />
      </Box>

      {/* 発話インジケーター */}
      {isSpeaking && (
        <Box
          sx={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '16px',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            zIndex: 10,
          }}
          role="status"
          aria-live="polite"
        >
          <VolumeUpIcon sx={{ fontSize: '1rem' }} />
          <Typography variant="caption" sx={{ color: 'inherit' }}>
            {t('avatar.speaking', '発話中')}
          </Typography>
        </Box>
      )}

      {/* 感情状態インジケーター（デバッグ用、本番では非表示可） */}
      {process.env.NODE_ENV === 'development' && (
        <Box
          sx={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '8px',
            fontSize: '0.7rem',
            zIndex: 10,
          }}
        >
          <Typography variant="caption" sx={{ color: 'inherit' }}>
            {t('avatar.emotion', '感情')}: {currentEmotion}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default VRMAvatarContainer;
