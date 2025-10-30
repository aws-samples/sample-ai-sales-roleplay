import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Box,
  LinearProgress,
  Chip,
  Paper,
  Avatar,
  Tab,
  Tabs,
  Alert,
  AlertTitle,
  Divider,
} from "@mui/material";
import GoalResultsSection from "../components/conversation/GoalResultsSection";
import {
  Home as HomeIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  ChatBubble as ChatBubbleIcon,
  Assessment as AssessmentIcon,
  Lightbulb as LightbulbIcon,
  Gavel as GavelIcon,
  Videocam as VideocamIcon,
  Description as DescriptionIcon,
} from "@mui/icons-material";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
  ArcElement,
} from "chart.js";
import { Line, Radar } from "react-chartjs-2";
import type { Session, Metrics, GoalStatus, Goal } from "../types/index";
import type { RealtimeMetric } from "../types/api";
import { addMetricsChangesToMessages } from "../utils/dialogueEngine";
import VideoFeedback from "../components/recording/VideoFeedback";
import ReferenceCheck from "../components/referenceCheck/ReferenceCheck";
import type { ScenarioInfo } from "../types/api";
import ComplianceViolationsList from "../components/compliance/ComplianceViolationsList";

// サービスのインポート
import { ApiService } from "../services/ApiService";
import type { FeedbackAnalysisResult } from "../types/api";

// Chart.jsの登録
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
);

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`result-tabpanel-${index}`}
      aria-labelledby={`result-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

const ResultPage: React.FC = () => {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [tabValue, setTabValue] = useState(0);
  
  // セッション種別の状態管理（音声分析かどうか）
  const [isAudioAnalysis, setIsAudioAnalysis] = useState(false);

  // シナリオ情報の状態管理
  const [scenario, setScenario] = useState<ScenarioInfo | null>(null);

  // シナリオ情報を取得するeffect
  useEffect(() => {
    const fetchScenario = async () => {
      if (session?.scenarioId) {
        try {
          const apiService = ApiService.getInstance();
          const scenarioInfo = await apiService.getScenarioDetail(
            session.scenarioId,
          );
          setScenario(scenarioInfo);
        } catch (error) {
          console.error(t("results.scenarioInfoFetchFailed") + ":", error);
        }
      }
    };

    if (session) {
      fetchScenario();
    }
  }, [session, t]);

  // 状態管理
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [detailedFeedback, setDetailedFeedback] =
    useState<FeedbackAnalysisResult | null>(null);
  const [realtimeMetricsHistory, setRealtimeMetricsHistory] = useState<
    RealtimeMetric[]
  >([]);
  const [scenarioGoals, setScenarioGoals] = useState<Goal[]>([]);

  // APIサービスのインスタンス取得
  const apiService = ApiService.getInstance();

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAudioAnalysisSession = (completeData: any, sessionId: string) => {
    try {
      console.log("音声分析セッションの処理を開始:", completeData);
      
      // 音声分析データから既にメッセージが構築されているのでそのまま使用
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = (completeData.messages || []).map((msg: any) => ({
        id: (msg.messageId as string) || crypto.randomUUID(),
        sender: msg.sender as "user" | "npc",
        content: msg.content as string,
        timestamp: new Date(msg.timestamp as string),
        metrics: undefined, // 音声分析では個別メトリクスなし
      }));

      // 音声分析用のSessionオブジェクトを構築
      const constructedSession: Session = {
        id: sessionId,
        scenarioId: (completeData.sessionInfo?.scenarioId as string) || "default",
        startTime: new Date((completeData.sessionInfo?.createdAt as string) || new Date().toISOString()),
        endTime: new Date((completeData.sessionInfo?.createdAt as string) || new Date().toISOString()),
        messages: messages,
        finalMetrics: completeData.finalMetrics as Metrics,
        finalScore: (completeData.feedback?.scores?.overall as number) || 0,
        feedback: [],
        goalStatuses: (completeData.goalResults?.goalStatuses as GoalStatus[]) || [],
        goalScore: (completeData.goalResults?.goalScore as number) || 0,
        endReason: "音声分析完了",
        complianceViolations: [],
      };

      setSession(constructedSession);
      setDetailedFeedback(completeData.feedback as FeedbackAnalysisResult);
      setRealtimeMetricsHistory([]); // 音声分析ではリアルタイムメトリクス履歴なし
      setScenarioGoals((completeData.goalResults?.scenarioGoals as Goal[]) || []);
      
      console.log("音声分析セッション処理完了:", constructedSession);
    } catch (err) {
      console.error("音声分析セッション処理エラー:", err);
      setError("音声分析結果の読み込み中にエラーが発生しました");
    }
  };

  useEffect(() => {
    if (!sessionId) return;

    const loadSessionData = async () => {
      try {
        setLoading(true);

        // セッション分析結果をAPIから取得
        console.log(t("results.fetchingCompleteSessionData"), sessionId);
        const completeData = await apiService.getSessionCompleteData(sessionId);

        console.log(
          t("results.completeSessionDataFetched") + ":",
          completeData,
        );

        // 音声分析セッションかどうかを判定
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessionType = (completeData as any).sessionType;
        if (sessionType === "audio-analysis") {
          // 音声分析セッションフラグを設定
          setIsAudioAnalysis(true);
          // 音声分析セッションの処理
          handleAudioAnalysisSession(completeData, sessionId);
          setLoading(false); // ローディング状態を解除
          return;
        }
        
        // 通常セッションの場合
        setIsAudioAnalysis(false);

        // セッション基本情報からSessionオブジェクトを構築
        const sessionInfo = completeData.sessionInfo;
        const messages = completeData.messages
          .filter((msg) => msg.sender === "user" || msg.sender === "npc") // systemメッセージを除外
          .map((msg) => ({
            id: msg.messageId || crypto.randomUUID(),
            sender: msg.sender as "user" | "npc",
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            metrics: undefined, // メトリクス情報は別途処理
          }));

        // メッセージにメトリクス変化情報を追加
        const messagesWithMetrics = addMetricsChangesToMessages(messages);

        // 最終メトリクスの決定（リアルタイムメトリクスのみ使用）
        console.log(
          t("results.realtimeMetricsData") + ":",
          completeData.realtimeMetrics,
        );

        if (completeData.realtimeMetrics.length === 0) {
          console.error(t("results.realtimeMetricsNotFound"));
          throw new Error(t("results.incompleteSessionData"));
        }

        // リアルタイムメトリクスの最新値を使用
        const latestMetrics =
          completeData.realtimeMetrics[completeData.realtimeMetrics.length - 1];
        console.log(t("results.latestRealtimeMetrics") + ":", latestMetrics);

        const finalMetrics: Metrics = {
          angerLevel: Number(latestMetrics.angerLevel),
          trustLevel: Number(latestMetrics.trustLevel),
          progressLevel: Number(latestMetrics.progressLevel),
          analysis: latestMetrics.analysis,
        };

        console.log(t("results.finalMetricsSet") + ":", finalMetrics);

        // ゴール情報を設定（数値文字列を数値に変換）
        let goalStatuses: GoalStatus[] = [];
        let goalScore = 0;
        let scenarioGoals: Goal[] = [];

        if (completeData.goalResults) {
          // goalStatusesの型変換
          goalStatuses = completeData.goalResults.goalStatuses.map(
            (status) => ({
              goalId: status.goalId,
              achieved: status.achieved,
              achievedAt: status.achievedAt && status.achievedAt !== "null" 
                ? (() => {
                    try {
                      const date = new Date(status.achievedAt);
                      return isNaN(date.getTime()) ? undefined : date;
                    } catch {
                      return undefined;
                    }
                  })()
                : undefined,
              progress: Number(status.progress),
            }),
          );
          goalScore = Number(completeData.goalResults.goalScore);

          // scenarioGoalsの型変換
          scenarioGoals = completeData.goalResults.scenarioGoals.map(
            (goal) => ({
              id: goal.id,
              description: goal.description,
              isRequired: goal.isRequired,
              priority: Number(goal.priority),
              criteria: goal.criteria,
            }),
          );
        } else if (completeData.realtimeMetrics.length > 0) {
          // リアルタイムメトリクスからゴール情報を取得
          const latestMetricsWithGoals = completeData.realtimeMetrics.find(
            (m) => m.goalStatuses && m.goalStatuses.length > 0,
          );
          if (latestMetricsWithGoals && latestMetricsWithGoals.goalStatuses) {
            // 型変換: string | number → number, string | null → Date | undefined
            goalStatuses = latestMetricsWithGoals.goalStatuses.map(
              (status) => ({
                goalId: status.goalId,
                achieved: status.achieved,
                achievedAt: status.achievedAt && status.achievedAt !== "null"
                  ? (() => {
                      try {
                        const date = new Date(status.achievedAt);
                        return isNaN(date.getTime()) ? undefined : date;
                      } catch {
                        return undefined;
                      }
                    })()
                  : undefined,
                progress: Number(status.progress),
              }),
            );
            goalScore = Number(latestMetricsWithGoals.goalScore);
          }
        }

        // 最終スコアを決定（Bedrockのoverallスコアのみ使用）
        let finalScore = 0;

        // 詳細フィードバックが取得できている場合はそのoverallスコアを使用
        if (
          completeData.feedback &&
          completeData.feedback.scores &&
          completeData.feedback.scores.overall
        ) {
          finalScore = completeData.feedback.scores.overall;
          console.log("Bedrockのoverallスコアを使用:", finalScore);
        } else {
          console.log("Bedrockスコアが生成されていません");
        }

        // 最終メトリクスの処理（finalMetricsがある場合は使用、なければリアルタイムメトリクスから）
        let processedFinalMetrics: Metrics;
        if (completeData.finalMetrics) {
          processedFinalMetrics = {
            angerLevel: Number(completeData.finalMetrics.angerLevel),
            trustLevel: Number(completeData.finalMetrics.trustLevel),
            progressLevel: Number(completeData.finalMetrics.progressLevel),
            analysis: completeData.finalMetrics.analysis,
          };
        } else {
          processedFinalMetrics = finalMetrics;
        }

        // Sessionオブジェクトを構築
        const constructedSession: Session = {
          id: sessionId,
          scenarioId: sessionInfo.scenarioId || "default",
          startTime: new Date(
            sessionInfo.createdAt || new Date().toISOString(),
          ),
          endTime: new Date(
            sessionInfo.updatedAt ||
              sessionInfo.createdAt ||
              new Date().toISOString(),
          ),
          messages: messagesWithMetrics,
          finalMetrics: processedFinalMetrics,
          finalScore: finalScore,
          feedback: [],
          goalStatuses: goalStatuses,
          goalScore: goalScore,
          endReason:
            sessionInfo.status === "completed" ? "セッション完了" : undefined,
          // コンプライアンス違反データを追加
          complianceViolations: completeData.complianceViolations || [],
        };

        // セッション情報を設定
        setSession(constructedSession);

        // リアルタイムメトリクス履歴を保存（型変換）
        const processedRealtimeMetrics: RealtimeMetric[] =
          completeData.realtimeMetrics.map((metric) => ({
            angerLevel: Number(metric.angerLevel),
            trustLevel: Number(metric.trustLevel),
            progressLevel: Number(metric.progressLevel),
            analysis: metric.analysis,
            goalStatuses: metric.goalStatuses?.map((status) => ({
              goalId: status.goalId,
              achieved: status.achieved,
              achievedAt: status.achievedAt,
              progress: Number(status.progress),
            })),
            goalScore: Number(metric.goalScore),
            messageNumber: Number(metric.messageNumber),
            timestamp: metric.createdAt,
            userMessage: metric.userMessage,
          }));
        setRealtimeMetricsHistory(processedRealtimeMetrics);

        // シナリオゴールを保存
        console.log("設定するシナリオゴール:", scenarioGoals);
        console.log("ゴールスタータス:", goalStatuses);
        console.log("ゴールスコア:", goalScore);
        setScenarioGoals(scenarioGoals);

        // レガシーフィードバックは削除（Bedrockで生成されるため不要）
        setFeedback([]);

        // 詳細フィードバックを設定（APIから取得済み - complete-dataで統合）
        if (completeData.feedback) {
          console.log(
            "詳細フィードバックをAPIから取得:",
            completeData.feedback,
          );
          setDetailedFeedback(completeData.feedback);
        } else {
          console.log(
            "詳細フィードバックが存在しません（complete-data APIで自動生成されるはずです）",
          );
        }
      } catch (err) {
        console.error("セッションデータ読み込みエラー:", err);
        setError(t("errors.sessionLoadFailed"));
      } finally {
        setLoading(false);
      }
    };

    loadSessionData();
  }, [sessionId, navigate, apiService, t]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "success.main";
    if (score >= 60) return "warning.main";
    return "error.main";
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircleIcon color="success" />;
    if (score >= 60) return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const getPerformanceLevel = (score: number) => {
    if (score >= 80) return t("results.performanceLevels.excellent");
    if (score >= 60) return t("results.performanceLevels.good");
    if (score >= 40) return t("results.performanceLevels.needsImprovement");
    return t("results.performanceLevels.needsPractice");
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            my: 4,
          }}
        >
          <Typography variant="h6" color="text.secondary" mb={2}>
            {t("results.loadingAnalysis")}
          </Typography>
          <LinearProgress sx={{ width: "50%", mb: 2 }} />
          <Typography variant="body2" color="text.secondary" mt={2}>
            {t("results.loadingSessionData")}
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
        <Box display="flex" justifyContent="center" gap={2}>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => window.location.reload()}
          >
            {t("results.reloadPage")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<HomeIcon />}
            onClick={() => navigate("/")}
          >
            {t("results.backToHome")}
          </Button>
        </Box>
      </Container>
    );
  }

  if (!session) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning" sx={{ mb: 4 }}>
          {t("results.sessionNotFound")}
        </Alert>
        <Box display="flex" justifyContent="center" gap={2}>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => window.location.reload()}
          >
            {t("results.reloadPage")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<HomeIcon />}
            onClick={() => navigate("/")}
          >
            {t("results.backToHome")}
          </Button>
        </Box>
      </Container>
    );
  }

  const duration =
    session.endTime && session.startTime
      ? Math.round(
          (new Date(session.endTime).getTime() -
            new Date(session.startTime).getTime()) /
            60000,
        )
      : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* タブナビゲーション */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="result tabs"
          centered
        >
          <Tab
            icon={<AssessmentIcon />}
            label={t("results.evaluationSummary")}
            id="result-tab-0"
            aria-controls="result-tabpanel-0"
          />
          <Tab
            icon={<ChatBubbleIcon />}
            label={t("results.conversationHistory")}
            id="result-tab-1"
            aria-controls="result-tabpanel-1"
          />
          <Tab
            icon={<GavelIcon />}
            label={t("compliance.title")}
            id="result-tab-2"
            aria-controls="result-tabpanel-2"
          />
          {!isAudioAnalysis && (
            <Tab
              icon={<VideocamIcon />}
              label={t("videoAnalysis.title")}
              id="result-tab-3"
              aria-controls="result-tabpanel-3"
            />
          )}
          <Tab
            icon={<DescriptionIcon />}
            label={t("referenceCheck.title")}
            id={isAudioAnalysis ? "result-tab-3" : "result-tab-4"}
            aria-controls={isAudioAnalysis ? "result-tabpanel-3" : "result-tabpanel-4"}
          />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        {/* 総合スコア */}
        <Card sx={{ mb: 4, textAlign: "center", p: 3 }}>
          <CardContent>
            {detailedFeedback ? (
              <>
                <Box
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  gap={2}
                  mb={2}
                >
                  {getScoreIcon(detailedFeedback.scores.overall)}
                  <Typography
                    variant="h2"
                    sx={{
                      color: getScoreColor(detailedFeedback.scores.overall),
                      fontWeight: "bold",
                    }}
                  >
                    {detailedFeedback.scores.overall}
                  </Typography>
                  <Typography variant="h4" color="text.secondary">
                    / 100
                  </Typography>
                </Box>
                <Chip
                  label={getPerformanceLevel(detailedFeedback.scores.overall)}
                  color={
                    detailedFeedback.scores.overall >= 80
                      ? "success"
                      : detailedFeedback.scores.overall >= 60
                        ? "warning"
                        : "error"
                  }
                  sx={{ fontSize: "1rem", py: 1 }}
                />
              </>
            ) : (
              <>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {t("results.generatingScoreAnalysis")}
                </Alert>
                <Typography variant="h6" color="text.secondary">
                  {t("results.preparingDetailedAnalysis")}
                </Typography>
              </>
            )}
            {session.endReason && (
              <Typography
                variant="body1"
                sx={{ mt: 2, fontWeight: "medium", color: "text.primary" }}
              >
                {session.endReason}
              </Typography>
            )}
            <Typography variant="body1" color="text.secondary" mt={2}>
              {t("results.sessionStats", {
                duration: duration,
                count: session.messages.length,
              })}
            </Typography>
          </CardContent>
        </Card>

        {/* エラー表示 */}
        {error && (
          <Alert severity="error" sx={{ mb: 4 }}>
            {error}
          </Alert>
        )}

        {/* ローディング表示 */}
        {loading ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              my: 4,
            }}
          >
            <Typography variant="h6" color="text.secondary" mb={2}>
              {t("results.loadingAnalysis")}
            </Typography>
            <LinearProgress sx={{ width: "50%", mb: 2 }} />
          </Box>
        ) : (
          <Box
            display="flex"
            gap={3}
            sx={{ flexDirection: { xs: "column", md: "row" } }}
          >
            {/* 詳細評価カラム */}
            <Box flexGrow={1} sx={{ minWidth: { xs: "100%", md: "300px" } }}>
              {/* チャート表示 - パフォーマンス分析（詳細フィードバックがある場合のみ表示） */}
              {detailedFeedback && (
                <Card sx={{ mb: 3, p: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {t("results.performanceAnalysis")}
                    </Typography>
                    <Box
                      sx={{
                        height: 300,
                        mt: 2,
                        mx: "auto",
                        width: "100%",
                        maxWidth: "500px",
                      }}
                    >
                      <Radar
                        data={{
                          labels: [
                            t("results.skillLabels.communication"),
                            t("results.skillLabels.needsAnalysis"),
                            t("results.skillLabels.proposalQuality"),
                            t("results.skillLabels.flexibility"),
                            t("results.skillLabels.trustBuilding"),
                          ],
                          datasets: [
                            {
                              label: t("results.currentScore"),
                              data: [
                                detailedFeedback.scores.communication || 0,
                                detailedFeedback.scores.needsAnalysis || 0,
                                detailedFeedback.scores.proposalQuality || 0,
                                detailedFeedback.scores.flexibility || 0,
                                detailedFeedback.scores.trustBuilding || 0,
                              ],
                              backgroundColor: "rgba(54, 162, 235, 0.2)",
                              borderColor: "rgba(54, 162, 235, 1)",
                              borderWidth: 1,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            r: {
                              beginAtZero: true,
                              max: 10,
                              min: 0,
                              ticks: {
                                stepSize: 2,
                              },
                              pointLabels: {
                                font: {
                                  size: 12,
                                },
                              },
                            },
                          },
                        }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* メトリクス変化チャート（リアルタイムメトリクス履歴がある場合のみ表示） */}
              {realtimeMetricsHistory.length > 0 && (
                <Card sx={{ mb: 3, p: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {t("results.metricsChange")}
                    </Typography>
                    <Box
                      sx={{
                        height: 300,
                        mt: 2,
                        mx: "auto",
                        width: "100%",
                        maxWidth: "500px",
                      }}
                    >
                      <Line
                        data={{
                          labels: [...realtimeMetricsHistory]
                            .reverse()
                            .map((_, index) =>
                              t("results.round", { count: index + 1 }),
                            ),
                          datasets: [
                            {
                              label: t("metrics.angerMeter"),
                              data: [...realtimeMetricsHistory]
                                .reverse()
                                .map((m) => Number(m.angerLevel)),
                              borderColor: "rgba(255, 99, 132, 1)",
                              backgroundColor: "rgba(255, 99, 132, 0.2)",
                            },
                            {
                              label: t("metrics.trustLevel"),
                              data: [...realtimeMetricsHistory]
                                .reverse()
                                .map((m) => Number(m.trustLevel)),
                              borderColor: "rgba(54, 162, 235, 1)",
                              backgroundColor: "rgba(54, 162, 235, 0.2)",
                            },
                            {
                              label: t("metrics.progressLevel"),
                              data: [...realtimeMetricsHistory]
                                .reverse()
                                .map((m) => Number(m.progressLevel)),
                              borderColor: "rgba(75, 192, 192, 1)",
                              backgroundColor: "rgba(75, 192, 192, 0.2)",
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            y: {
                              min: 0,
                              max: 10,
                              ticks: {
                                stepSize: 2,
                              },
                            },
                          },
                          plugins: {
                            legend: {
                              position: "top",
                              labels: {
                                boxWidth: 15,
                                padding: 10,
                              },
                            },
                          },
                        }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* キーポイント分析 */}
              <Card sx={{ mb: 3, p: 2 }}>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <LightbulbIcon color="warning" sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      {t("results.keyPointAnalysis")}
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />

                  {detailedFeedback ? (
                    <>
                      {/* 強み */}
                      {detailedFeedback.strengths.map(
                        (strength: string, index: number) => (
                          <Alert
                            key={`strength-${index}`}
                            severity="success"
                            sx={{ mb: 2 }}
                          >
                            {strength}
                          </Alert>
                        ),
                      )}

                      {/* 改善点 */}
                      {detailedFeedback.improvements.map(
                        (improvement: string, index: number) => (
                          <Alert
                            key={`improvement-${index}`}
                            severity="warning"
                            sx={{ mb: 2 }}
                          >
                            {improvement}
                          </Alert>
                        ),
                      )}

                      {/* 重要な洞察 */}
                      {detailedFeedback.keyInsights?.map(
                        (insight: string, index: number) => (
                          <Alert
                            key={`insight-${index}`}
                            severity="info"
                            sx={{ mb: 2 }}
                          >
                            {insight}
                          </Alert>
                        ),
                      )}

                      {/* 次のステップ */}
                      {detailedFeedback.nextSteps && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            {t("results.nextSteps")}
                          </Typography>
                          {detailedFeedback.nextSteps}
                        </Alert>
                      )}
                    </>
                  ) : (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      {t("results.detailedFeedbackNotAvailable")}
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* 詳細評価 */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {t("results.detailedEvaluation")}
                  </Typography>

                  {/* 怒りメーター */}
                  <Box mb={3}>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      mb={1}
                    >
                      <Typography variant="subtitle2">
                        {t("metrics.angerMeter")}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {session.finalMetrics.angerLevel}/10
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={(session.finalMetrics.angerLevel / 10) * 100}
                      color={
                        session.finalMetrics.angerLevel >= 7
                          ? "error"
                          : session.finalMetrics.angerLevel >= 4
                            ? "warning"
                            : "success"
                      }
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>

                  {/* 信頼度 */}
                  <Box mb={3}>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      mb={1}
                    >
                      <Typography variant="subtitle2">
                        {t("metrics.trustLevel")}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {session.finalMetrics.trustLevel}/10
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={(session.finalMetrics.trustLevel / 10) * 100}
                      color={
                        session.finalMetrics.trustLevel >= 7
                          ? "success"
                          : session.finalMetrics.trustLevel >= 4
                            ? "info"
                            : "error"
                      }
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>

                  {/* 商談進捗度 */}
                  <Box>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      mb={1}
                    >
                      <Typography variant="subtitle2">
                        {t("metrics.progressLevel")}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {session.finalMetrics.progressLevel}/10
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={(session.finalMetrics.progressLevel / 10) * 100}
                      color={
                        session.finalMetrics.progressLevel >= 7
                          ? "success"
                          : session.finalMetrics.progressLevel >= 4
                            ? "info"
                            : "error"
                      }
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                </CardContent>
              </Card>

              {/* スキル詳細スコア（詳細フィードバックがある場合のみ表示） */}
              {detailedFeedback && (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      💯 {t("results.skillDetailedScore")}
                    </Typography>

                    {/* コミュニケーション力 */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.communication")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.communication}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.communication / 10) * 100
                        }
                        color="primary"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* ニーズ把握 */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.needsAnalysis")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.needsAnalysis}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.needsAnalysis / 10) * 100
                        }
                        color="info"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* 提案品質 */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.proposalQuality")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.proposalQuality}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.proposalQuality / 10) * 100
                        }
                        color="success"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* 対応の柔軟性 */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.flexibility")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.flexibility}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={(detailedFeedback.scores.flexibility / 10) * 100}
                        color="warning"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* 信頼構築 */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.trustBuilding")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.trustBuilding}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.trustBuilding / 10) * 100
                        }
                        color="secondary"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* 異議対応力 */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.objectionHandling")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.objectionHandling}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.objectionHandling / 10) * 100
                        }
                        color="error"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* クロージングスキル */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.closingSkill")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.closingSkill}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.closingSkill / 10) * 100
                        }
                        color="info"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* 傾聴スキル */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.listeningSkill")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.listeningSkill}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.listeningSkill / 10) * 100
                        }
                        color="success"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* 製品知識 */}
                    <Box mb={2}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.productKnowledge")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.productKnowledge}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.productKnowledge / 10) * 100
                        }
                        color="primary"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>

                    {/* 顧客中心思考 */}
                    <Box>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Typography variant="subtitle2">
                          {t("results.skillLabels.customerFocus")}
                        </Typography>
                        <Typography variant="body2" fontWeight="bold">
                          {detailedFeedback.scores.customerFocus}/10
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={
                          (detailedFeedback.scores.customerFocus / 10) * 100
                        }
                        color="warning"
                        sx={{ height: 8, borderRadius: 4 }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* レガシーフィードバック - UI表示なし */}
              {!detailedFeedback && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      📝 {t("results.feedback")}
                    </Typography>
                    {feedback.map((item, index) => (
                      <Paper
                        key={index}
                        sx={{ p: 2, mb: 2, backgroundColor: "#f5f5f5" }}
                      >
                        <Typography variant="body2">{item}</Typography>
                      </Paper>
                    ))}
                  </CardContent>
                </Card>
              )}
            </Box>

            {/* サイドバー */}
            <Box sx={{ width: { xs: "100%", md: "300px" }, flexShrink: 0 }}>
              {/* NPC情報 */}
              {scenario && (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {t("results.conversationPartner")}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={2} mb={2}>
                      <Avatar
                        sx={{ width: 40, height: 40, fontSize: "1.2rem" }}
                      >
                        {scenario.npc?.avatar ||
                          scenario.npcInfo?.avatar ||
                          "👤"}
                      </Avatar>
                      <Box>
                        <Typography variant="body1" fontWeight="bold">
                          {scenario.npc?.name ||
                            scenario.npcInfo?.name ||
                            "Unknown"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {scenario.npc?.role || scenario.npcInfo?.role || ""}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {scenario.npc?.description ||
                        scenario.npcInfo?.description ||
                        ""}
                    </Typography>
                  </CardContent>
                </Card>
              )}

              {/* 統計情報 */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    📊 {t("results.sessionStatistics")}
                  </Typography>
                  <Box mb={2}>
                    <Typography variant="body2" color="text.secondary">
                      {t("results.conversationTime")}
                    </Typography>
                    <Typography variant="h6">
                      {duration} {t("results.minutes")}
                    </Typography>
                  </Box>
                  <Box mb={2}>
                    <Typography variant="body2" color="text.secondary">
                      {t("results.messageCount")}
                    </Typography>
                    <Typography variant="h6">
                      {session.messages.length} {t("results.times")}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {t("results.userMessages")}
                    </Typography>
                    <Typography variant="h6">
                      {
                        session.messages.filter((m) => m.sender === "user")
                          .length
                      }{" "}
                      {t("results.times")}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>

              {/* アクションボタン */}
              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<RefreshIcon />}
                  onClick={() => navigate("/scenarios")}
                >
                  {t("results.tryAnotherScenario")}
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<HomeIcon />}
                  onClick={() => navigate("/")}
                >
                  {t("results.backToHome")}
                </Button>
              </Box>
            </Box>
          </Box>
        )}
        {/* ゴール達成状況セクション */}
        {scenarioGoals && scenarioGoals.length > 0 && (
          <GoalResultsSection
            goals={scenarioGoals}
            goalStatuses={session?.goalStatuses || []}
          />
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t("results.conversationLog")}
            </Typography>
            <Box sx={{ maxHeight: "500px", overflow: "auto", mt: 2 }}>
              {session.messages.map((msg, index) => (
                <Paper
                  key={index}
                  sx={{
                    p: 2,
                    mb: 2,
                    backgroundColor:
                      msg.sender === "user" ? "#e3f2fd" : "#f5f5f5",
                    ml: msg.sender === "user" ? "auto" : 0,
                    mr: msg.sender === "user" ? 0 : "auto",
                    maxWidth: "80%",
                    position: "relative",
                  }}
                >
                  <Typography
                    variant="caption"
                    display="block"
                    color="text.secondary"
                    gutterBottom
                  >
                    {msg.sender === "user"
                      ? t("results.you")
                      : scenario?.npc?.name ||
                        scenario?.npcInfo?.name ||
                        "NPC"}{" "}
                    - {new Date(msg.timestamp).toLocaleTimeString()}
                  </Typography>
                  <Typography variant="body1">{msg.content}</Typography>

                  {msg.metrics && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: "1px dashed #ddd" }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {t("results.metricsChangeLabel")}
                      </Typography>
                      <Box display="flex" gap={2} mt={0.5}>
                        <Chip
                          label={t("results.angerMeter", {
                            value: msg.metrics.angerLevel,
                          })}
                          size="small"
                          variant="outlined"
                          color={
                            msg.metrics.angerChange &&
                            msg.metrics.angerChange > 0
                              ? "error"
                              : "default"
                          }
                        />
                        <Chip
                          label={t("results.trustLevel", {
                            value: msg.metrics.trustLevel,
                          })}
                          size="small"
                          variant="outlined"
                          color={
                            msg.metrics.trustChange &&
                            msg.metrics.trustChange > 0
                              ? "success"
                              : "default"
                          }
                        />
                        <Chip
                          label={t("results.progressLevel", {
                            value: msg.metrics.progressLevel,
                          })}
                          size="small"
                          variant="outlined"
                          color={
                            msg.metrics.progressChange &&
                            msg.metrics.progressChange > 0
                              ? "info"
                              : "default"
                          }
                        />
                      </Box>
                    </Box>
                  )}
                </Paper>
              ))}
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* コンプライアンス違反一覧タブ */}
      <TabPanel value={tabValue} index={2}>
        <Box sx={{ maxWidth: 900, mx: "auto" }}>
          <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
            {t("compliance.report", "コンプライアンス違反レポート")}
          </Typography>

          {!session?.complianceViolations ||
          session.complianceViolations.length === 0 ? (
            <Alert severity="info" sx={{ mb: 3 }}>
              <AlertTitle>
                {t("compliance.noDataTitle", "データなし")}
              </AlertTitle>
              {t(
                "compliance.noData",
                "このセッションにはコンプライアンス違反データがありません。",
              )}
            </Alert>
          ) : (
            <ComplianceViolationsList
              violations={session.complianceViolations}
            />
          )}

          <Box
            sx={{ mt: 4, p: 3, bgcolor: "background.default", borderRadius: 2 }}
          >
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              {t("compliance.explanationTitle", "コンプライアンス違反について")}
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {t(
                "compliance.explanation1",
                "コンプライアンス違反は、営業活動において法令や倫理規範に反する表現や行為を示します。違反を避けることで、顧客との信頼関係を構築し、リスクを最小限に抑えることができます。",
              )}
            </Typography>
            <Typography variant="body2">
              {t(
                "compliance.explanation2",
                "上記のレポートを参考に、今後の商談での表現を改善していきましょう。特に「高」重大度の違反は、法的リスクが高いため特に注意が必要です。",
              )}
            </Typography>
          </Box>
        </Box>
      </TabPanel>

      {/* ビデオ分析タブ（音声分析セッションでは非表示） */}
      {!isAudioAnalysis && (
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ maxWidth: 900, mx: "auto" }}>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                {sessionId && (
                  <VideoFeedback 
                    sessionId={sessionId} 
                    isVisible={true} 
                    language={scenario?.language || "ja"}
                  />
                )}
              </CardContent>
            </Card>
          </Box>
        </TabPanel>
      )}

      {/* リファレンスチェックタブ */}
      <TabPanel value={tabValue} index={isAudioAnalysis ? 3 : 4}>
        <Box sx={{ maxWidth: 900, mx: "auto" }}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              {sessionId && (
                <ReferenceCheck 
                  sessionId={sessionId} 
                  language={scenario?.language || "ja"}
                  isVisible={true} 
                />
              )}
            </CardContent>
          </Card>
        </Box>
      </TabPanel>
    </Container>
  );
};

export default ResultPage;
