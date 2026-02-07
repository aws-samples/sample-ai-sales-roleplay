import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Box } from "@mui/material";
import { useTranslation } from "react-i18next";

// コンポーネントのインポート
import Header from "./Header";
import HomePage from "../pages/HomePage";
import ScenarioSelectPage from "../pages/ScenarioSelectPage";
import ConversationPage from "../pages/ConversationPage";
import ResultPage from "../pages/ResultPage";
import ProfilePage from "../pages/ProfilePage";
import SessionHistoryPage from "../pages/history/SessionHistoryPage";
import RankingPage from "../pages/RankingPage";
import AudioAnalysisPage from "../pages/AudioAnalysisPage";
import AvatarTestPage from "../pages/AvatarTestPage";
import ScenarioCreatePage from "../pages/scenarios/ScenarioCreatePage";
import ScenarioEditPage from "../pages/scenarios/ScenarioEditPage";
import ScenarioManagementPage from "../pages/scenarios/management/ScenarioManagementPage";
/**
 * アプリケーションのメインコンテンツをレンダリングするコンポーネント
 * ヘッダータイトルの管理を担当し、ルーティングはrouter.tsxに委任
 */
const AppContent: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();

  // 現在のパスに基づいてページタイトルを決定
  const getPageTitle = () => {
    const path = location.pathname;

    if (path === "/") return undefined;
    if (path === "/scenarios") return t("scenarios.title");
    if (path === "/scenarios/create") return t("scenarios.create.title");
    if (path === "/scenarios/edit/:scenarioId")
      return t("scenarios.edit.title");
    if (path === "/profile") return t("profile.title");
    if (path === "/history") return t("history.title");
    if (path === "/rankings") return t("ranking.title");
    if (path === "/audio-analysis") return t("audioAnalysis.title");
    if (path === "/avatar-test") return "VRM表情テスト";
    if (path.startsWith("/conversation/")) return t("conversation.title");
    if (path.startsWith("/results/")) return t("results.title");
    if (path.startsWith("/history/session/")) return t("history.sessionDetail");
    if (path.startsWith("/session-loading/")) return t("session.loading");

    return undefined;
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header pageTitle={getPageTitle()} />
      <Box component="main" sx={{ flexGrow: 1, py: 2 }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/scenarios" element={<ScenarioSelectPage />} />
          <Route path="/scenarios/create" element={<ScenarioCreatePage />} />
          <Route
            path="/scenarios/edit/:scenarioId"
            element={<ScenarioEditPage />}
          />
          <Route
            path="/scenarios/manage"
            element={<ScenarioManagementPage />}
          />
          <Route
            path="/conversation/:scenarioId"
            element={<ConversationPage />}
          />
          <Route path="/result/:sessionId" element={<ResultPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/history" element={<SessionHistoryPage />} />
          <Route path="/history/session/:sessionId" element={<ResultPage />} />
          <Route path="/rankings" element={<RankingPage />} />
          <Route path="/audio-analysis" element={<AudioAnalysisPage />} />
          <Route path="/avatar-test" element={<AvatarTestPage />} />
        </Routes>
      </Box>
    </Box>
  );
};

export default AppContent;
