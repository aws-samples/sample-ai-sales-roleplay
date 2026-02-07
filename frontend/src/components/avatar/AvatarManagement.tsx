/**
 * アバター管理画面コンポーネント
 * アバター一覧表示、アップロード、削除を提供
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  CircularProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';
import { AvatarService, AvatarMetadata } from '../../services/AvatarService';
import AvatarUpload from './AvatarUpload';

interface AvatarManagementProps {
  /** 選択中のアバターID */
  selectedAvatarId?: string;
  /** アバター選択時のコールバック */
  onSelect?: (avatarId: string) => void;
}

const AvatarManagement: React.FC<AvatarManagementProps> = ({
  selectedAvatarId,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [avatars, setAvatars] = useState<AvatarMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<AvatarMetadata | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAvatars = useCallback(async () => {
    setLoading(true);
    try {
      const avatarService = AvatarService.getInstance();
      const list = await avatarService.listAvatars();
      setAvatars(list.filter(a => a.status === 'active'));
    } catch (error) {
      console.error('アバター一覧取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAvatars();
  }, [loadAvatars]);

  const handleUploadComplete = useCallback((avatarId: string) => {
    loadAvatars();
    onSelect?.(avatarId);
  }, [loadAvatars, onSelect]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const avatarService = AvatarService.getInstance();
      await avatarService.deleteAvatar(deleteTarget.avatarId);
      setDeleteTarget(null);
      loadAvatars();
    } catch (error) {
      console.error('アバター削除エラー:', error);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, loadAvatars]);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {t('avatar.management.title', 'アバター管理')}
      </Typography>

      {/* アップロードセクション */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          {t('avatar.management.upload', '新しいアバターをアップロード')}
        </Typography>
        <AvatarUpload onUploadComplete={handleUploadComplete} />
      </Box>

      {/* アバター一覧 */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress aria-label={t('avatar.management.loading', '読み込み中')} />
        </Box>
      ) : avatars.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('avatar.management.empty', 'アップロードされたアバターはありません')}
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {avatars.map((avatar) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={avatar.avatarId}>
              <Card
                variant={selectedAvatarId === avatar.avatarId ? 'outlined' : 'elevation'}
                sx={{
                  border: selectedAvatarId === avatar.avatarId ? 2 : undefined,
                  borderColor: selectedAvatarId === avatar.avatarId ? 'primary.main' : undefined,
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" noWrap sx={{ flex: 1 }}>
                      {avatar.name}
                    </Typography>
                    {selectedAvatarId === avatar.avatarId && (
                      <CheckCircleIcon color="primary" fontSize="small" aria-label={t('avatar.management.selected', '選択中')} />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {avatar.fileName}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Chip
                      label={avatar.status === 'active'
                        ? t('avatar.management.statusActive', '利用可能')
                        : t('avatar.management.statusUploading', 'アップロード中')}
                      size="small"
                      color={avatar.status === 'active' ? 'success' : 'default'}
                    />
                  </Box>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    onClick={() => onSelect?.(avatar.avatarId)}
                    disabled={selectedAvatarId === avatar.avatarId}
                    aria-label={t('avatar.management.select', '選択')}
                  >
                    {t('avatar.management.select', '選択')}
                  </Button>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => setDeleteTarget(avatar)}
                    aria-label={t('avatar.management.delete', '削除')}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* 削除確認ダイアログ */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          {t('avatar.management.deleteConfirmTitle', 'アバターの削除')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            {t('avatar.management.deleteConfirmMessage', '「{{name}}」を削除しますか？この操作は取り消せません。', {
              name: deleteTarget?.name || '',
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            {t('common.cancel', 'キャンセル')}
          </Button>
          <Button onClick={handleDelete} color="error" disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : t('common.delete', '削除')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AvatarManagement;
