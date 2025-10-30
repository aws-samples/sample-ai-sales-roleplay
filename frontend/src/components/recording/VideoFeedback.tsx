import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  AlertTitle,
  LinearProgress,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { VideoAnalysisResult } from "../../types/api";
import { ApiService } from "../../services/ApiService";

interface VideoFeedbackProps {
  sessionId: string;
  isVisible?: boolean;
  language?: string;
}

/**
 * 動画分析結果表示コンポーネント
 */
const VideoFeedback: React.FC<VideoFeedbackProps> = ({
  sessionId,
  isVisible = true,
  language = "ja",
}) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [videoAnalysis, setVideoAnalysis] =
    useState<VideoAnalysisResult | null>(null);

  // 動画分析結果の取得
  const fetchVideoAnalysis = React.useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const apiService = ApiService.getInstance();
      const result = await apiService.getVideoAnalysis(sessionId, language);
      if (result && result.videoAnalysis) {
        setVideoAnalysis(result.videoAnalysis);
      }
    } catch (err: unknown) {
      console.error("Error fetching video analysis:", err);

      // 404エラー（分析データが存在しない）の場合は、分析中状態を維持
      if (
        err &&
        typeof err === "object" &&
        "response" in err &&
        err.response &&
        typeof err.response === "object" &&
        "status" in err.response &&
        err.response.status === 404
      ) {
        // 分析データがまだ存在しない場合は、エラーではなく分析中として扱う
        setVideoAnalysis(null);
        setError("");
      } else {
        setError(t("videoFeedback.fetchError"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, language, t]);

  // 初期データ取得
  useEffect(() => {
    if (isVisible && sessionId) {
      fetchVideoAnalysis();
    }
  }, [sessionId, isVisible, language, fetchVideoAnalysis]);

  // 分析データがない場合の定期ポーリング
  useEffect(() => {
    if (!videoAnalysis && !isLoading && !error && isVisible && sessionId) {
      const pollInterval = setInterval(() => {
        fetchVideoAnalysis();
      }, 30000); // 30秒間隔でポーリング

      return () => clearInterval(pollInterval);
    }
  }, [
    videoAnalysis,
    isLoading,
    error,
    isVisible,
    sessionId,
    language,
    fetchVideoAnalysis,
  ]);

  // コンポーネントが非表示の場合は何も表示しない
  if (!isVisible) {
    return null;
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : videoAnalysis ? (
        <Box>
          <Typography variant="h6" gutterBottom>
            📹 {t("videoFeedback.title")}
          </Typography>

          {/* 総合スコア */}
          <Box sx={{ mb: 3, textAlign: "center" }}>
            <Typography variant="h4" color="primary" gutterBottom>
              {videoAnalysis.overallScore}/10
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("videoFeedback.overallScore")}
            </Typography>
          </Box>

          {/* 詳細スコア */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              {t("videoFeedback.detailedEvaluation")}
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={1}
              >
                <Typography variant="body2">
                  {t("videoFeedback.eyeContact")}
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {videoAnalysis.eyeContact}/10
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(videoAnalysis.eyeContact / 10) * 100}
                color="primary"
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={1}
              >
                <Typography variant="body2">
                  {t("videoFeedback.facialExpression")}
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {videoAnalysis.facialExpression}/10
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(videoAnalysis.facialExpression / 10) * 100}
                color="secondary"
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={1}
              >
                <Typography variant="body2">
                  {t("videoFeedback.gesture")}
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {videoAnalysis.gesture}/10
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(videoAnalysis.gesture / 10) * 100}
                color="success"
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={1}
              >
                <Typography variant="body2">
                  {t("videoFeedback.emotion")}
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {videoAnalysis.emotion}/10
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(videoAnalysis.emotion / 10) * 100}
                color="warning"
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          </Box>

          {/* 強み */}
          {videoAnalysis.strengths.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                ✅ {t("videoFeedback.strengths")}
              </Typography>
              {Array.isArray(videoAnalysis.strengths) &&
                videoAnalysis.strengths.map((strength, index) => (
                  <Alert key={index} severity="success" sx={{ mb: 1 }}>
                    {typeof strength === "string" ? (
                      strength
                    ) : (
                      <Box>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: "bold" }}
                        >
                          {strength.title}
                        </Typography>
                        <Typography variant="body2">
                          {strength.description}
                        </Typography>
                      </Box>
                    )}
                  </Alert>
                ))}
            </Box>
          )}

          {/* 改善点 */}
          {videoAnalysis.improvements.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                💡 {t("videoFeedback.improvements")}
              </Typography>
              {Array.isArray(videoAnalysis.improvements) &&
                videoAnalysis.improvements.map((improvement, index) => (
                  <Alert key={index} severity="warning" sx={{ mb: 1 }}>
                    {typeof improvement === "string" ? (
                      improvement
                    ) : (
                      <Box>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: "bold" }}
                        >
                          {improvement.title}
                        </Typography>
                        <Typography variant="body2">
                          {improvement.description}
                        </Typography>
                      </Box>
                    )}
                  </Alert>
                ))}
            </Box>
          )}

          {/* 詳細分析 */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              📊 {t("videoFeedback.analysis")}
            </Typography>
            <Box sx={{ p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {videoAnalysis.analysis}
              </Typography>
            </Box>
          </Box>
        </Box>
      ) : (
        // 動画分析データがない場合は「分析中」を表示
        <Box sx={{ textAlign: "center", p: 4 }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {t("videoFeedback.analyzing", "分析中...")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(
              "videoFeedback.analysisInProgress",
              "動画の分析を実行しています。しばらくお待ちください。",
            )}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default VideoFeedback;
