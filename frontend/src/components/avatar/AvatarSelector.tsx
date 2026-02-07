/**
 * アバター選択コンポーネント
 * シナリオ管理画面でのアバター選択UI
 * manifest.jsonからアバター一覧を取得してグリッド表示
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Paper,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AvatarThumbnail } from './AvatarThumbnail';
import { AvatarInfo, AvatarManifest } from '../../types/avatar';

/**
 * AvatarSelectorのプロパティ
 */
export interface AvatarSelectorProps {
  /** 選択中のアバターID */
  selectedAvatarId?: string;
  /** アバター選択時のコールバック */
  onSelect: (avatarId: string) => void;
  /** 無効状態 */
  disabled?: boolean;
  /** サムネイルサイズ */
  thumbnailSize?: number;
  /** グリッドの列数（xs） */
  gridColumnsXs?: number;
  /** グリッドの列数（sm） */
  gridColumnsSm?: number;
  /** グリッドの列数（md） */
  gridColumnsMd?: number;
}

// マニフェストファイルのパス
const MANIFEST_PATH = '/models/avatars/manifest.json';

/**
 * アバター選択コンポーネント
 * マニフェストからアバター一覧を取得し、グリッド形式で表示
 */
export const AvatarSelector: React.FC<AvatarSelectorProps> = ({
  selectedAvatarId,
  onSelect,
  disabled = false,
  thumbnailSize = 80,
  gridColumnsXs = 6,
  gridColumnsSm = 4,
  gridColumnsMd = 3,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  // 状態管理
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultAvatarId, setDefaultAvatarId] = useState<string | null>(null);

  /**
   * マニフェストファイルを読み込み
   */
  const loadManifest = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(MANIFEST_PATH);

      if (!response.ok) {
        throw new Error(`マニフェストの読み込みに失敗しました: ${response.status}`);
      }

      const manifest: AvatarManifest = await response.json();

      // バリデーション
      if (!manifest.avatars || !Array.isArray(manifest.avatars)) {
        throw new Error('マニフェストの形式が不正です');
      }

      setAvatars(manifest.avatars);
      setDefaultAvatarId(manifest.defaultAvatarId || null);

      // 選択されていない場合、デフォルトアバターを選択
      if (!selectedAvatarId && manifest.defaultAvatarId) {
        const defaultAvatar = manifest.avatars.find(
          (a) => a.id === manifest.defaultAvatarId
        );
        if (defaultAvatar) {
          onSelect(defaultAvatar.id);
        }
      }
    } catch (err) {
      console.error('アバターマニフェスト読み込みエラー:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'アバター一覧の読み込みに失敗しました'
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedAvatarId, onSelect]);

  // 初回マウント時にマニフェストを読み込み
  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  /**
   * アバター選択ハンドラー
   */
  const handleSelect = useCallback(
    (avatarId: string) => {
      if (!disabled) {
        onSelect(avatarId);
      }
    },
    [disabled, onSelect]
  );

  /**
   * サムネイルURLを生成
   */
  const getThumbnailUrl = (avatar: AvatarInfo): string | undefined => {
    if (avatar.thumbnail) {
      // 相対パスの場合、ベースパスを追加
      if (avatar.thumbnail.startsWith('/')) {
        return avatar.thumbnail;
      }
      return `/models/avatars/${avatar.thumbnail}`;
    }
    return undefined;
  };

  // ローディング表示
  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 120,
        }}
        role="status"
        aria-label={t('common.loading', 'Loading...')}
      >
        <CircularProgress size={40} />
      </Box>
    );
  }

  // エラー表示
  if (error) {
    return (
      <Alert
        severity="error"
        sx={{ mb: 2 }}
        role="alert"
      >
        {error}
      </Alert>
    );
  }

  // アバターがない場合
  if (avatars.length === 0) {
    return (
      <Alert
        severity="info"
        sx={{ mb: 2 }}
      >
        {t('avatar.noAvatarsAvailable', '利用可能なアバターがありません')}
      </Alert>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        backgroundColor: theme.palette.background.default,
      }}
    >
      {/* セクションタイトル */}
      <Typography
        variant="subtitle2"
        component="h3"
        sx={{ mb: 2, fontWeight: 600 }}
        id="avatar-selector-label"
      >
        {t('avatar.selectAvatar', 'アバターを選択')}
      </Typography>

      {/* アバターグリッド */}
      <Grid
        container
        spacing={2}
        role="radiogroup"
        aria-labelledby="avatar-selector-label"
      >
        {avatars.map((avatar) => {
          const isSelected = selectedAvatarId === avatar.id;
          const isDefault = avatar.id === defaultAvatarId;

          return (
            <Grid
              item
              xs={gridColumnsXs}
              sm={gridColumnsSm}
              md={gridColumnsMd}
              key={avatar.id}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}
              >
                <AvatarThumbnail
                  avatarId={avatar.id}
                  thumbnailUrl={getThumbnailUrl(avatar)}
                  size={thumbnailSize}
                  onClick={() => handleSelect(avatar.id)}
                  selected={isSelected}
                  disabled={disabled}
                  name={avatar.name}
                />

                {/* デフォルトバッジ */}
                {isDefault && (
                  <Typography
                    variant="caption"
                    sx={{
                      mt: 0.5,
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      backgroundColor: theme.palette.info.light,
                      color: theme.palette.info.contrastText,
                      fontSize: '0.65rem',
                    }}
                  >
                    {t('avatar.default', 'デフォルト')}
                  </Typography>
                )}

                {/* 説明文（ツールチップ代わり） */}
                {avatar.description && isSelected && (
                  <Typography
                    variant="caption"
                    sx={{
                      mt: 0.5,
                      textAlign: 'center',
                      color: theme.palette.text.secondary,
                      maxWidth: thumbnailSize + 40,
                    }}
                  >
                    {avatar.description}
                  </Typography>
                )}
              </Box>
            </Grid>
          );
        })}
      </Grid>

      {/* 選択状態の通知（スクリーンリーダー用） */}
      <Box
        aria-live="polite"
        aria-atomic="true"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {selectedAvatarId && (
          <span>
            {t('avatar.selected', '{{name}}が選択されました', {
              name: avatars.find((a) => a.id === selectedAvatarId)?.name || selectedAvatarId,
            })}
          </span>
        )}
      </Box>
    </Paper>
  );
};

export default AvatarSelector;
