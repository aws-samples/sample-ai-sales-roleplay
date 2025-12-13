import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Paper,
  Alert,
  CircularProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { useTranslation } from "react-i18next";
import { ApiService } from "../../../services/ApiService";
import { PdfFileInfo } from "../../../types/api";

interface PdfFilesStepProps {
  formData: {
    scenarioId?: string;
    pdfFiles: PdfFileInfo[];
  };
  updateFormData: (data: { pdfFiles: PdfFileInfo[] }) => void;
}

const PdfFilesStep: React.FC<PdfFilesStepProps> = ({
  formData,
  updateFormData,
}) => {
  const { t } = useTranslation();
  const apiService = ApiService.getInstance();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingFiles, setDeletingFiles] = useState<Set<number>>(new Set());
  // ESLintエラー対応のため、使用していない変数はコメントアウト
  // const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});

  /**
   * PDFファイルとメタデータファイルを一括アップロード
   * @param file アップロードするPDFファイル
   * @param scenarioId シナリオID
   * @returns アップロード結果
   */
  const uploadPdfWithMetadata = async (file: File, scenarioId: string) => {
    // PDFファイルの署名付きURLを取得
    const pdfUrlInfo = await apiService.getPdfUploadUrl(
      scenarioId,
      file.name,
      file.type,
    );

    // PDFファイルをアップロード
    await apiService.uploadPdfFile(
      pdfUrlInfo.uploadUrl,
      pdfUrlInfo.formData,
      file,
      file.type,
    );

    // メタデータファイル名を生成（例: document.pdf → document.pdf.metadata.json）
    const metadataFileName = `${file.name}.metadata.json`;

    // メタデータファイル用の署名付きURLを取得
    const metadataUrlInfo = await apiService.getPdfMetadataUploadUrl(
      scenarioId,
      metadataFileName,
    );

    // メタデータコンテンツを作成
    const metadataContent = {
      metadataAttributes: {
        scenarioId: scenarioId,
      },
    };

    // メタデータファイルをアップロード
    await apiService.uploadPdfMetadata(
      metadataUrlInfo.uploadUrl,
      metadataUrlInfo.formData,
      metadataContent,
    );

    return pdfUrlInfo;
  };

  // PDFファイルの選択ハンドラー
  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // 最大5ファイルの制限を確認
    const remainingSlots = 5 - formData.pdfFiles.length;
    if (remainingSlots <= 0) {
      setUploadError(
        t("scenarios.create.pdfFiles.maxFilesError") ||
          "PDFファイルは最大5つまでアップロードできます",
      );
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    // PDFファイルのみを許可
    const nonPdfFiles = filesToUpload.filter(
      (file) => file.type !== "application/pdf",
    );
    if (nonPdfFiles.length > 0) {
      setUploadError(
        t("scenarios.create.pdfFiles.onlyPdfError") ||
          "PDFファイルのみアップロードできます",
      );
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    // 一時的なシナリオIDの生成（新規作成時に必要）
    console.log(formData);
    const tempScenarioId = formData.scenarioId || `temp-${Date.now()}`;

    try {
      // 各ファイルをアップロード
      const newPdfFiles: PdfFileInfo[] = [];

      for (const file of filesToUpload) {
        // setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        // PDFファイルとメタデータファイルを一括アップロード
        const urlInfo = await uploadPdfWithMetadata(file, tempScenarioId);

        // アップロード完了
        // setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));

        // アップロード結果を追加
        newPdfFiles.push({
          key: urlInfo.key,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        });
      }

      // フォームデータを更新
      updateFormData({
        pdfFiles: [...formData.pdfFiles, ...newPdfFiles],
      });
    } catch (error) {
      console.error("PDF資料のアップロードに失敗しました:", error);
      setUploadError(
        t("scenarios.create.pdfFiles.uploadError") ||
          "アップロード中にエラーが発生しました",
      );
    } finally {
      setIsUploading(false);
      // setUploadProgress({});
      // ファイル選択をリセット
      event.target.value = "";
    }
  };

  // ファイル削除ハンドラー
  const handleDeleteFile = async (index: number) => {
    const fileToDelete = formData.pdfFiles[index];
    const tempScenarioId = formData.scenarioId || `temp-${Date.now()}`;

    // 削除中の状態を設定
    setDeletingFiles((prev) => new Set(prev).add(index));
    setUploadError(null);

    try {
      // S3からPDFファイルとメタデータファイルを削除
      const deleteResult = await apiService.deletePdfWithMetadata(
        tempScenarioId,
        fileToDelete.fileName,
      );

      if (deleteResult.success) {
        console.log("ファイル削除成功:", deleteResult.deletedFiles);

        // エラーがあった場合は警告を表示
        if (deleteResult.errors && deleteResult.errors.length > 0) {
          console.warn(
            "一部のファイル削除でエラーが発生:",
            deleteResult.errors,
          );
          setUploadError(
            `一部のファイル削除でエラーが発生しました: ${deleteResult.errors.join(", ")}`,
          );
        }
      } else {
        console.warn("ファイル削除に失敗しました");
        setUploadError("ファイルの削除に失敗しました");
      }
    } catch (error) {
      console.error("ファイル削除エラー:", error);
      setUploadError("ファイルの削除中にエラーが発生しました");
    } finally {
      // 削除中の状態を解除
      setDeletingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }

    // フォームデータからファイル情報を削除（S3削除の成否に関わらず実行）
    const newFiles = [...formData.pdfFiles];
    newFiles.splice(index, 1);
    updateFormData({ pdfFiles: newFiles });
  };

  // ファイルサイズのフォーマット
  const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined) return "";

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {t("scenarios.create.pdfFiles.title") || "営業資料のアップロード（評価用）"}
      </Typography>

      <Typography variant="body1" paragraph>
        {t("scenarios.create.pdfFiles.description") ||
          "営業資料（商品パンフレット、価格表、約款など）をPDFでアップロードすると、セッション後の評価で発言内容がこれらの資料と合っているかを自動チェックできます。正確な営業スキル向上に役立ちます。（最大5つまで）"}
      </Typography>

      {uploadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {uploadError}
        </Alert>
      )}

      {/* ファイルアップロードボタン */}
      <Box sx={{ mb: 3 }}>
        <input
          accept="application/pdf"
          style={{ display: "none" }}
          id="pdf-file-upload"
          multiple
          type="file"
          onChange={handleFileSelect}
          disabled={isUploading || formData.pdfFiles.length >= 5}
        />
        <label htmlFor="pdf-file-upload">
          <Button
            variant="contained"
            component="span"
            disabled={isUploading || formData.pdfFiles.length >= 5}
            startIcon={<FileUploadIcon />}
          >
            {isUploading
              ? t("scenarios.create.pdfFiles.uploading") || "アップロード中..."
              : t("scenarios.create.pdfFiles.uploadButton") ||
                "PDFファイルを選択"}
          </Button>
        </label>
      </Box>

      {/* アップロード進行状況 */}
      {isUploading && (
        <Box sx={{ mb: 2 }}>
          <CircularProgress size={24} sx={{ mr: 1 }} />
          <Typography variant="body2" component="span">
            {t("scenarios.create.pdfFiles.uploadingMessage") ||
              "アップロード中です..."}
          </Typography>
        </Box>
      )}

      {/* アップロード済みファイル一覧 */}
      {formData.pdfFiles.length > 0 ? (
        <Paper sx={{ mb: 3, maxHeight: 300, overflow: "auto" }}>
          <List>
            {formData.pdfFiles.map((file, index) => (
              <ListItem
                key={file.key || index}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleDeleteFile(index)}
                    disabled={deletingFiles.has(index)}
                  >
                    {deletingFiles.has(index) ? (
                      <CircularProgress size={20} />
                    ) : (
                      <DeleteIcon />
                    )}
                  </IconButton>
                }
              >
                <PictureAsPdfIcon color="error" sx={{ mr: 2 }} />
                <ListItemText
                  primary={file.fileName}
                  secondary={`${formatFileSize(file.size)} - ${file.contentType}`}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      ) : (
        <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
          {t("scenarios.create.pdfFiles.noFiles") ||
            "アップロードされたファイルはありません"}
        </Typography>
      )}

      <Typography variant="caption" color="textSecondary">
        {t("scenarios.create.pdfFiles.note") ||
          "※ アップロードしたPDFは、営業セッション後のリファレンスチェック（発言の正確性評価）に使用されます"}
      </Typography>

      {/* 評価例の表示 */}
      {t("scenarios.create.pdfFiles.example") && (
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1, fontStyle: "italic" }}>
          {t("scenarios.create.pdfFiles.example")}
        </Typography>
      )}
    </Box>
  );
};

export default PdfFilesStep;
