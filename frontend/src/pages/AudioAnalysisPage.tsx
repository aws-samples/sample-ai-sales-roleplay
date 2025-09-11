import React, { useState, useEffect } from "react";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  LinearProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Stepper,
  Step,
  StepLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  CloudUpload as CloudUploadIcon,
  PlayArrow as PlayArrowIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { AudioAnalysisService } from "../services/AudioAnalysisService";
import { ApiService } from "../services/ApiService";
import {
  AudioAnalysisLanguage,
  AudioAnalysisStatusResponse,
} from "../types/audioAnalysis";
import { ScenarioInfo } from "../types/api";

/**
 * 音声分析ページ
 * 商談音声データをアップロードして分析するページ
 */
const AudioAnalysisPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] =
    useState<AudioAnalysisLanguage>("ja");
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] =
    useState<AudioAnalysisStatusResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [analysisSessionId, setAnalysisSessionId] = useState<string>("");

  const audioAnalysisService = AudioAnalysisService.getInstance();
  const apiService = ApiService.getInstance();

  useEffect(() => {
    // ページタイトルの設定
    document.title = `${t("audioAnalysis.title", "音声分析")} | ${t("app.title")}`;
  }, [t]);

  useEffect(() => {
    // シナリオ一覧を取得
    const fetchScenarios = async () => {
      try {
        const response = await apiService.getScenarios();
        if (response.scenarios) {
          setScenarios(response.scenarios);
        }
      } catch (error) {
        console.error("シナリオ取得エラー:", error);
        setError("シナリオ一覧の取得に失敗しました");
      }
    };

    fetchScenarios();
  }, [apiService]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // ファイルバリデーション
      const validation = audioAnalysisService.validateAudioFile(file);
      if (!validation.isValid) {
        setError(validation.error || "ファイル形式が無効です");
        return;
      }

      setSelectedFile(file);
      setError("");
    }
  };

  const handleLanguageChange = (language: AudioAnalysisLanguage) => {
    setSelectedLanguage(language);
  };

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile || !selectedScenario) {
      setError("音声ファイルとシナリオを選択してください");
      return;
    }

    try {
      setError("");
      setIsUploading(true);
      setUploadProgress(0);

      // 音声分析を実行
      const result = await audioAnalysisService.executeFullAnalysis(
        selectedFile,
        selectedScenario,
        selectedLanguage,
        (progress) => {
          setUploadProgress(progress);
        },
        (status) => {
          setAnalysisStatus(status);
          if (status.status === "IN_PROGRESS") {
            setIsUploading(false);
            setIsAnalyzing(true);
          } else if (status.status === "FAILED" || status.currentStep === "ERROR") {
            // エラー時の処理
            setIsUploading(false);
            setIsAnalyzing(false);
            const errorMessage = status.progress?.error || "音声分析でエラーが発生しました";
            setError(errorMessage);
          }
        }
      );

      // 分析完了
      setIsAnalyzing(false);
      setAnalysisSessionId(result.sessionId);
      setResultDialogOpen(true);
    } catch (error) {
      console.error("音声分析エラー:", error);
      setError(
        error instanceof Error ? error.message : "音声分析に失敗しました"
      );
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const handleViewResults = () => {
    setResultDialogOpen(false);
    // 既存のResultPageに遷移
    navigate(`/result/${analysisSessionId}`);
  };

  const getStepContent = () => {
    if (isUploading) {
      return "音声ファイルをアップロード中...";
    } else if (isAnalyzing) {
      switch (analysisStatus?.currentStep) {
        case "START":
          return "分析準備中...";
        case "TRANSCRIBING":
          return "音声転写中...";
        case "ANALYZING":
          return "AI分析中...";
        case "SAVING":
          return "結果保存中...";
        case "ERROR":
          return "分析でエラーが発生しました";
        default:
          return "分析中...";
      }
    }
    return "待機中";
  };

  const activeStep = () => {
    if (isUploading) return 0;
    if (analysisStatus?.currentStep === "START") return 1;
    if (analysisStatus?.currentStep === "TRANSCRIBING") return 2;
    if (analysisStatus?.currentStep === "ANALYZING") return 3;
    if (analysisStatus?.currentStep === "SAVING") return 4;
    if (analysisStatus?.currentStep === "ERROR") return -1; // エラー時は特別扱い
    return 0;
  };

  const steps = [
    "アップロード",
    "分析準備",
    "音声転写",
    "AI分析",
    "結果保存",
  ];

  return (
    <Container maxWidth="lg">
      <Box sx={{ pt: 4, pb: 8 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {t("audioAnalysis.title", "音声分析")}
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          {t(
            "audioAnalysis.description",
            "実際の商談音声データをアップロードして、選択したシナリオで分析を行います。"
          )}
        </Typography>

        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t("audioAnalysis.settings", "分析設定")}
            </Typography>

            {/* 言語選択 */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                {t("audioAnalysis.language", "言語設定")}
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Chip
                  label="日本語"
                  color={selectedLanguage === "ja" ? "primary" : "default"}
                  onClick={() => handleLanguageChange("ja")}
                  variant={selectedLanguage === "ja" ? "filled" : "outlined"}
                />
                <Chip
                  label="English"
                  color={selectedLanguage === "en" ? "primary" : "default"}
                  onClick={() => handleLanguageChange("en")}
                  variant={selectedLanguage === "en" ? "filled" : "outlined"}
                />
              </Box>
            </Box>

            {/* シナリオ選択 */}
            <Box sx={{ mb: 3 }}>
              <FormControl fullWidth>
                <InputLabel>
                  {t("audioAnalysis.selectScenario", "分析シナリオを選択")}
                </InputLabel>
                <Select
                  value={selectedScenario}
                  onChange={(e) => handleScenarioChange(e.target.value)}
                  label={t("audioAnalysis.selectScenario", "分析シナリオを選択")}
                >
                  {scenarios.map((scenario) => (
                    <MenuItem key={scenario.scenarioId} value={scenario.scenarioId}>
                      {scenario.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* ファイル選択 */}
            <Box sx={{ mb: 3 }}>
              <input
                accept="audio/*,.mp3,.wav,.flac,.ogg"
                style={{ display: "none" }}
                id="audio-file-upload"
                type="file"
                onChange={handleFileSelect}
              />
              <label htmlFor="audio-file-upload">
                <Button
                  variant="outlined"
                  component="span"
                  startIcon={<CloudUploadIcon />}
                  disabled={isUploading || isAnalyzing}
                >
                  {selectedFile
                    ? selectedFile.name
                    : t("audioAnalysis.selectFile", "音声ファイルを選択")}
                </Button>
              </label>
            </Box>

            {/* エラー表示 */}
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {/* 分析開始ボタン */}
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              onClick={handleStartAnalysis}
              disabled={
                !selectedFile || !selectedScenario || isUploading || isAnalyzing
              }
              size="large"
            >
              {t("audioAnalysis.startAnalysis", "分析開始")}
            </Button>
          </CardContent>
        </Card>

        {/* 進行状況表示 */}
        {(isUploading || isAnalyzing) && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {t("audioAnalysis.progress", "分析進行状況")}
              </Typography>

              <Stepper activeStep={activeStep()} sx={{ mb: 3 }}>
                {steps.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>

              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {getStepContent()}
                </Typography>
              </Box>

              {isUploading && (
                <LinearProgress
                  variant="determinate"
                  value={uploadProgress}
                  sx={{ mb: 2 }}
                />
              )}

              {isAnalyzing && (
                <LinearProgress variant="indeterminate" sx={{ mb: 2 }} />
              )}

              <Typography variant="caption" color="text.secondary">
                {t(
                  "audioAnalysis.processingNote",
                  "※ 処理に時間がかかる場合があります。画面を閉じずにお待ちください。"
                )}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* 結果表示ダイアログ */}
        <Dialog
          open={resultDialogOpen}
          onClose={() => setResultDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {t("audioAnalysis.analysisComplete", "音声分析完了")}
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {t(
                "audioAnalysis.analysisCompleteMessage",
                "音声分析が完了しました。結果を確認しますか？"
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(
                "audioAnalysis.resultViewNote",
                "分析結果画面では、話者の役割分析、評価スコア、リファレンスチェックなどの詳細を確認できます。"
              )}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setResultDialogOpen(false)}>
              {t("common.cancel", "キャンセル")}
            </Button>
            <Button
              onClick={handleViewResults}
              variant="contained"
              color="primary"
            >
              {t("audioAnalysis.viewResults", "結果を確認")}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};

export default AudioAnalysisPage;
