/**
 * VRMアバターアップロードコンポーネント
 * ファイル選択 → S3アップロード → メタデータ登録の一連のフローを提供
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  LinearProgress,
  Alert,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useTranslation } from 'react-i18next';
import { AvatarService } from '../../services/AvatarService';

interface AvatarUploadProps {
  /** アップロード完了時のコールバック */
  onUploadComplete?: (avatarId: string) => void;
  /** エラー時のコールバック */
  onError?: (error: Error) => void;
}

const MAX_FILE_SIZE_MB = 50;

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  onUploadComplete,
  onError,
}) => {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // VRMファイルのみ許可
    if (!file.name.toLowerCase().endsWith('.vrm')) {
      setError(t('avatar.upload.invalidFormat', 'VRMファイルのみアップロード可能です'));
      return;
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(t('avatar.upload.tooLarge', `ファイルサイズは${MAX_FILE_SIZE_MB}MB以下にしてください`));
      return;
    }

    setError(null);
    setSelectedFile(file);
  }, [t]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploading(true);
    setProgress(10);
    setError(null);

    try {
      const avatarService = AvatarService.getInstance();

      // 1. メタデータ登録 + アップロードURL取得
      setProgress(20);
      const createResult = await avatarService.createAvatar(
        selectedFile.name,
        selectedFile.name.replace('.vrm', ''),
        'application/octet-stream'
      );

      // 2. S3にアップロード
      setProgress(40);
      await avatarService.uploadVrmFile(
        createResult.uploadUrl,
        createResult.formData,
        selectedFile
      );

      // 3. アップロード完了確認
      setProgress(80);
      await avatarService.confirmUpload(createResult.avatarId);

      setProgress(100);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      onUploadComplete?.(createResult.avatarId);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('アップロードに失敗しました');
      setError(errorObj.message);
      onError?.(errorObj);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [selectedFile, onUploadComplete, onError]);

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button
          component="label"
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          disabled={uploading}
          aria-label={t('avatar.upload.selectFile', 'VRMファイルを選択')}
        >
          {t('avatar.upload.selectFile', 'VRMファイルを選択')}
          <input
            ref={fileInputRef}
            type="file"
            accept=".vrm"
            hidden
            onChange={handleFileSelect}
            aria-hidden="true"
          />
        </Button>

        {selectedFile && (
          <Typography variant="body2" color="text.secondary">
            {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)}MB)
          </Typography>
        )}
      </Box>

      {selectedFile && !uploading && (
        <Button
          variant="contained"
          onClick={handleUpload}
          aria-label={t('avatar.upload.start', 'アップロード開始')}
        >
          {t('avatar.upload.start', 'アップロード開始')}
        </Button>
      )}

      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            aria-label={t('avatar.upload.progress', 'アップロード進捗')}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('avatar.upload.uploading', 'アップロード中...')} {progress}%
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default AvatarUpload;
