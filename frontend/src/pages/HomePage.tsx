import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  Box,
  Dialog,
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  School as SchoolIcon,
  TrendingUp as TrendingUpIcon,
  MenuBook as MenuBookIcon,
  Psychology as PsychologyIcon,
  Audiotrack as AudiotrackIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

// DemoStarter コンポーネントのインポート
import DemoStarter from "../components/DemoStarter";

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [demoGuideOpen, setDemoGuideOpen] = useState(false);

  const handleOpenDemoGuide = () => {
    setDemoGuideOpen(true);
  };

  const handleCloseDemoGuide = () => {
    setDemoGuideOpen(false);
  };

  const features = [
    {
      icon: <PsychologyIcon color="primary" sx={{ fontSize: 40 }} />,
      title: t("home.features.aiPartner.title"),
      description: t("home.features.aiPartner.description"),
    },
    {
      icon: <TrendingUpIcon color="primary" sx={{ fontSize: 40 }} />,
      title: t("home.features.realtime.title"),
      description: t("home.features.realtime.description"),
    },
    {
      icon: <SchoolIcon color="primary" sx={{ fontSize: 40 }} />,
      title: t("home.features.feedback.title"),
      description: t("home.features.feedback.description"),
    },
    {
      icon: <AudiotrackIcon color="primary" sx={{ fontSize: 40 }} />,
      title: t("home.features.audioAnalysis.title"),
      description: t("home.features.audioAnalysis.description"),
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* ヘッダーセクション */}
      <Box textAlign="center" mb={4}>
        <Typography
          variant="h3"
          component="h1"
          gutterBottom
          color="primary"
          fontWeight="bold"
        >
          {t("home.title")}
        </Typography>
        <Typography variant="h6" color="text.secondary" mb={3}>
          {t("home.subtitle")}
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          maxWidth="600px"
          mx="auto"
        >
          {t("home.description")}
        </Typography>
      </Box>

      {/* 特徴セクション */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            md: "1fr 1fr",
          },
          gap: 3,
          mb: 4,
          maxWidth: "800px",
          mx: "auto",
        }}
      >
        {features.map((feature, index) => (
          <Card
            key={index}
            sx={{
              textAlign: "center",
              p: 2,
              height: "100%",
            }}
          >
            <CardContent>
              <Box mb={2}>{feature.icon}</Box>
              <Typography variant="h6" component="h3" gutterBottom>
                {feature.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {feature.description}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* 体験の流れセクション */}
      <Card sx={{ mb: 4, bgcolor: "primary.main", color: "white" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            💼 {t("home.experienceFlow.title")}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                md: "1fr 1fr 1fr 1fr",
              },
              gap: 3,
              mt: 2,
            }}
          >
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h6" gutterBottom>
                1. {t("home.experienceFlow.step1.title")}
              </Typography>
              <Typography variant="body2">
                {t("home.experienceFlow.step1.description")}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h6" gutterBottom>
                2. {t("home.experienceFlow.step2.title")}
              </Typography>
              <Typography variant="body2">
                {t("home.experienceFlow.step2.description")}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h6" gutterBottom>
                3. {t("home.experienceFlow.step3.title")}
              </Typography>
              <Typography variant="body2">
                {t("home.experienceFlow.step3.description")}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h6" gutterBottom>
                4. {t("home.experienceFlow.step4.title")}
              </Typography>
              <Typography variant="body2">
                {t("home.experienceFlow.step4.description")}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* スタートボタン */}
      <Box textAlign="center" display="flex" gap={2} justifyContent="center" flexWrap="wrap">
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayIcon />}
          onClick={() => navigate("/scenarios")}
          sx={{
            fontSize: "1.2rem",
            py: 2,
            px: 4,
            boxShadow: 3,
          }}
        >
          {t("home.startButton")}
        </Button>

        <Button
          variant="contained"
          size="large"
          startIcon={<AudiotrackIcon />}
          onClick={() => navigate("/audio-analysis")}
          sx={{
            fontSize: "1.2rem",
            py: 2,
            px: 4,
            boxShadow: 3,
            bgcolor: "secondary.main",
            "&:hover": {
              bgcolor: "secondary.dark",
            },
          }}
        >
          {t("home.audioAnalysisButton")}
        </Button>

        <Button
          variant="outlined"
          size="large"
          startIcon={<MenuBookIcon />}
          onClick={handleOpenDemoGuide}
          sx={{
            fontSize: "1.2rem",
            py: 2,
            px: 4,
          }}
        >
          {t("home.demoGuideButton")}
        </Button>
      </Box>

      {/* デモガイドダイアログ */}
      <Dialog
        open={demoGuideOpen}
        onClose={handleCloseDemoGuide}
        maxWidth="lg"
        fullWidth
      >
        <DemoStarter onClose={handleCloseDemoGuide} />
      </Dialog>
    </Container>
  );
};

export default HomePage;
