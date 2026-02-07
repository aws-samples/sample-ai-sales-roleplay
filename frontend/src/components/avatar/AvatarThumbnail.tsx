/**
 * アバターサムネイルコンポーネント
 * アバターのサムネイル画像またはプレースホルダーを表示
 */
import React from 'react';
import { Box, Avatar, Typography, useTheme } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';

/**
 * AvatarThumbnailのプロパティ
 */
export interface AvatarThumbnailProps {
  /** アバターID */
  avatarId: string;
  /** サムネイル画像URL */
  thumbnailUrl?: string;
  /** サムネイルサイズ（ピクセル） */
  size?: number;
  /** クリックハンドラー */
  onClick?: () => void;
  /** 選択状態 */
  selected?: boolean;
  /** 無効状態 */
  disabled?: boolean;
  /** アバター名（アクセシビリティ用） */
  name?: string;
}

/**
 * アバターサムネイルコンポーネント
 * サムネイル画像またはプレースホルダーアイコンを表示
 */
export const AvatarThumbnail: React.FC<AvatarThumbnailProps> = ({
  avatarId,
  thumbnailUrl,
  size = 80,
  onClick,
  selected = false,
  disabled = false,
  name,
}) => {
  const theme = useTheme();

  // 選択状態のスタイル
  const selectedStyle = selected
    ? {
      border: `3px solid ${theme.palette.primary.main}`,
      boxShadow: `0 0 8px ${theme.palette.primary.main}`,
    }
    : {
      border: `2px solid ${theme.palette.divider}`,
    };

  // ホバースタイル
  const hoverStyle = !disabled && onClick
    ? {
      cursor: 'pointer',
      '&:hover': {
        borderColor: theme.palette.primary.light,
        transform: 'scale(1.05)',
        transition: 'all 0.2s ease-in-out',
      },
    }
    : {};

  // 無効状態のスタイル
  const disabledStyle = disabled
    ? {
      opacity: 0.5,
      cursor: 'not-allowed',
    }
    : {};

  return (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      aria-label={name || `アバター ${avatarId}`}
      onKeyDown={(e) => {
        if (!disabled && onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <Avatar
        src={thumbnailUrl}
        alt={name || `アバター ${avatarId}`}
        sx={{
          width: size,
          height: size,
          bgcolor: theme.palette.grey[200],
          ...selectedStyle,
          ...hoverStyle,
          ...disabledStyle,
        }}
      >
        {/* サムネイルがない場合のプレースホルダー */}
        {!thumbnailUrl && (
          <PersonIcon
            sx={{
              fontSize: size * 0.6,
              color: theme.palette.grey[500],
            }}
          />
        )}
      </Avatar>
      {/* アバター名を表示（オプション） */}
      {name && (
        <Typography
          variant="caption"
          sx={{
            maxWidth: size + 20,
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
            fontWeight: selected ? 600 : 400,
          }}
        >
          {name}
        </Typography>
      )}
    </Box>
  );
};

export default AvatarThumbnail;
