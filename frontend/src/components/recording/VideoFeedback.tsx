import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Alert,
  LinearProgress,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { VideoAnalysisResult } from "../../types/api";

interface VideoFeedbackProps {
  sessionId: string;
  isVisible?: boolean;
  language?: string;
  /** Step Functionsで取得済みの動画分析結果（渡された場合はAPIを呼び出さない） */
  initialData?: VideoAnalysisResult | null;
}

/**
 * 動画分析結果表示コンポーネント
 */
const VideoFeedback: React.FC<VideoFeedbackProps> = ({
  isVisible = true,
  initialData = null,
}) => {
  const { t } = useTranslation();
  const [videoAnalysis, setVideoAnalysis] =
    useState<VideoAnalysisResult | null>(initialData);

  // initialDataが変更された場合にデータを更新
  useEffect(() => {
    setVideoAnalysis(initialData);
  }, [initialData]);

  // コンポーネントが非表示の場合は何も表示しない
  if (!isVisible) {
    return null;
  }

  return (
    <Box>
      {videoAnalysis ? (
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
        // 動画分析データがない場合は「データなし」を表示
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            {t("videoFeedback.noDataTitle", "動画分析データなし")}
          </Typography>
          <Typography variant="body2">
            {t(
              "videoFeedback.noData",
              "このセッションには動画分析データがありません。セッション中にカメラで録画された場合のみ、動画分析が実行されます。",
            )}
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default VideoFeedback;
