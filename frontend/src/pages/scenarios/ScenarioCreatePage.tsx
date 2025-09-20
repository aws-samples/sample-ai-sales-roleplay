import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Paper,
  Box,
  CircularProgress,
  Alert,
  AlertTitle,
} from "@mui/material";
import { ApiService } from "../../services/ApiService";
import { useTranslation } from "react-i18next";
import {
  validateBasicInfo,
  validateNpcInfo,
  validateGoals,
  validateSharing,
} from "../../utils/validation";

// ステップコンポーネントをインポート
import BasicInfoStep from "./creation/BasicInfoStep";
import NPCInfoStep from "./creation/NPCInfoStep";
import GoalsStep from "./creation/GoalsStep";
import PdfFilesStep from "./creation/PdfFilesStep";
import SharingStep from "./creation/SharingStep";
import PreviewStep from "./creation/PreviewStep";
import { ScenarioInfo, DifficultyLevel } from "../../types/api";

/**
 * シナリオ作成ページ
 * ユーザーがカスタムシナリオを作成するためのマルチステップフォーム
 */
const ScenarioCreatePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const apiService = ApiService.getInstance();

  // ステップ管理
  const [activeStep, setActiveStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardrailsList, setGuardrailsList] = useState<
    Array<{
      arn: string;
      id: string;
      name: string;
      description: string;
    }>
  >([]);
  
  // バリデーションエラー管理
  const [validationErrors, setValidationErrors] = useState<{
    basicInfo: Record<string, string | null>;
    npcInfo: Record<string, string | null>;
    goals: Record<string, string | null>;
    sharing: Record<string, string | null>;
  }>({
    basicInfo: {},
    npcInfo: {},
    goals: {},
    sharing: {},
  });

  // フォームデータ
  const [formData, setFormData] = useState({
    // 基本情報
    scenarioId: "",
    title: "",
    description: "",
    difficulty: "normal" as DifficultyLevel,
    category: "",
    language: "ja", // デフォルトは日本語
    maxTurns: undefined as number | undefined, // 最大ターン数（任意）

    // NPC情報
    npc: {
      name: "",
      role: "",
      company: "",
      personality: [] as string[],
      description: "",
    },

    // 目標・メトリクス
    objectives: [] as string[],
    initialMetrics: {
      angerLevel: 1,
      trustLevel: 3,
      progressLevel: 2,
    },
    goals: [] as {
      id: string;
      description: string;
      isRequired: boolean;
      priority: number;
      criteria: string[];
    }[],

    // PDF資料
    pdfFiles: [] as {
      key: string;
      fileName: string;
      contentType: string;
      size?: number;
    }[],

    // 共有設定
    visibility: "private" as "public" | "private" | "shared",
    sharedWithUsers: [] as string[],
    guardrail: "",
    initialMessage: "",
  });

  // 初期化処理
  useEffect(() => {
    // ガードレールリストの取得
    const loadGuardrails = async () => {
      try {
        const guardrails = await apiService.getGuardrails();
        setGuardrailsList(guardrails);

        // デフォルト値として最初のガードレールを設定
        if (guardrails.length > 0) {
          setFormData((prev) => ({
            ...prev,
            guardrail: guardrails[0].name,
          }));
        }
      } catch (error) {
        console.error("ガードレールの取得に失敗しました:", error);
        setError(t("scenarios.create.error.guardrailsLoad"));
      }
    };

    loadGuardrails();
  }, [t, apiService]);

  // ステップの定義
  const steps = [
    { label: t("scenarios.create.steps.basicInfo") },
    { label: t("scenarios.create.steps.npcInfo") },
    { label: t("scenarios.create.steps.goals") },
    { label: t("scenarios.create.steps.pdfs") },
    { label: t("scenarios.create.steps.sharing") },
    { label: t("scenarios.create.steps.preview") },
  ];

  // 次のステップへ
  const handleNext = () => {
    // 現在のステップのバリデーション
    let isValid = true;
    const currentErrors = { ...validationErrors };

    if (activeStep === 0) {
      // 基本情報のバリデーション
      const errors = validateBasicInfo(
        formData.title,
        formData.description,
        formData.category,
        formData.language,
        formData.scenarioId,
        formData.maxTurns,
      );
      isValid = Object.values(errors).every((error) => error === null);
      currentErrors.basicInfo = errors;
    } else if (activeStep === 1) {
      // NPC情報のバリデーション
      const errors = validateNpcInfo(
        formData.npc.name,
        formData.npc.role,
        formData.npc.company,
      );
      isValid = Object.values(errors).every((error) => error === null);
      currentErrors.npcInfo = errors;
    } else if (activeStep === 2) {
      // 目標のバリデーション
      const errors = validateGoals(formData.objectives, formData.goals);
      isValid = Object.values(errors).every((error) => error === null);
      currentErrors.goals = errors;
    } else if (activeStep === 3) {
      // PDF資料ステップは特別なバリデーションは不要
      isValid = true;
    } else if (activeStep === 4) {
      // 共有設定のバリデーション
      const errors = validateSharing(
        formData.visibility,
        formData.sharedWithUsers,
        formData.guardrail,
      );
      isValid = Object.values(errors).every((error) => error === null);
      currentErrors.sharing = errors;
    }

    // バリデーションエラーを更新
    setValidationErrors(currentErrors);

    // バリデーションが成功した場合のみ次のステップへ
    if (isValid) {
      setActiveStep((prevStep) => prevStep + 1);
    }
  };

  // 前のステップへ
  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  // シナリオの保存
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // APIリクエスト用にデータを整形
      const scenarioData: Partial<ScenarioInfo> = {
        scenarioId: formData.scenarioId,
        title: formData.title,
        description: formData.description,
        difficulty: formData.difficulty,
        category: formData.category,
        npc: formData.npc,
        objectives: formData.objectives,
        initialMetrics: formData.initialMetrics,
        goals: formData.goals,
        pdfFiles: formData.pdfFiles.length > 0 ? formData.pdfFiles : undefined,
        visibility: formData.visibility,
        guardrail: formData.guardrail,
        language: formData.language,
        initialMessage: formData.initialMessage,
        maxTurns: formData.maxTurns,
        ...(formData.visibility === "shared"
          ? { sharedWithUsers: formData.sharedWithUsers }
          : {}),
      };

      // APIでシナリオを作成
      const response = await apiService.createScenario(scenarioData);

      // 成功した場合
      navigate("/scenarios", {
        state: {
          success: true,
          message: t("scenarios.create.success"),
          scenarioId: response.scenarioId,
        },
      });
    } catch (error) {
      console.error("シナリオ作成エラー:", error);
      setError(
        error instanceof Error
          ? error.message
          : t("scenarios.create.error.unknown"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // キャンセル処理
  const handleCancel = () => {
    if (window.confirm(t("scenarios.create.confirmCancel"))) {
      navigate("/scenarios");
    }
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ mt: 3, mb: 3, p: 3 }}>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          align="center"
          sx={{ mb: 4 }}
        >
          {t("scenarios.create.title")}
        </Typography>

        {/* エラーメッセージ */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <AlertTitle>{t("common.error")}</AlertTitle>
            {error}
          </Alert>
        )}

        {/* ステッパー */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }} alternativeLabel>
          {steps.map((step, index) => (
            <Step key={index}>
              <StepLabel>{step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* 現在のステップのコンテンツ */}
        <Box sx={{ mt: 2, mb: 4 }}>
          {activeStep === 0 && (
            <BasicInfoStep
              formData={formData}
              updateFormData={(data) => setFormData({ ...formData, ...data })}
              validationErrors={validationErrors.basicInfo}
            />
          )}
          {activeStep === 1 && (
            <NPCInfoStep
              formData={formData}
              updateFormData={(npcData) => {
                const { initialMessage, ...npcFields } = npcData;
                setFormData({
                  ...formData,
                  npc: { ...formData.npc, ...npcFields },
                  ...(initialMessage !== undefined && { initialMessage }),
                });
              }}
              validationErrors={validationErrors.npcInfo}
            />
          )}
          {activeStep === 2 && (
            <GoalsStep
              formData={formData}
              updateFormData={(data) => setFormData({ ...formData, ...data })}
              validationErrors={validationErrors.goals}
            />
          )}
          {activeStep === 3 && (
            <PdfFilesStep
              formData={{
                scenarioId: formData.scenarioId,
                pdfFiles: formData.pdfFiles,
              }}
              updateFormData={(data) =>
                setFormData({
                  ...formData,
                  pdfFiles: data.pdfFiles || formData.pdfFiles,
                })
              }
            />
          )}
          {activeStep === 4 && (
            <SharingStep
              formData={{
                visibility: formData.visibility,
                sharedWithUsers: formData.sharedWithUsers,
                guardrail: formData.guardrail,
              }}
              guardrailsList={guardrailsList}
              updateFormData={(data) =>
                setFormData({
                  ...formData,
                  visibility: data.visibility || formData.visibility,
                  sharedWithUsers:
                    data.sharedWithUsers || formData.sharedWithUsers,
                  guardrail: data.guardrail || formData.guardrail,
                })
              }
              validationErrors={validationErrors.sharing}
            />
          )}
          {activeStep === 5 && <PreviewStep formData={formData} />}
        </Box>

        {/* ナビゲーションボタン */}
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
          <Button
            variant="outlined"
            onClick={activeStep === 0 ? handleCancel : handleBack}
            sx={{ mr: 1 }}
            disabled={isSubmitting}
            data-testid={activeStep === 0 ? "cancel-button" : "back-button"}
          >
            {activeStep === 0 ? t("common.cancel") : t("common.back")}
          </Button>

          <Box>
            {activeStep === steps.length - 1 ? (
              <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
                startIcon={
                  isSubmitting && <CircularProgress size={24} color="inherit" />
                }
              >
                {isSubmitting ? t("common.saving") : t("scenarios.create.save")}
              </Button>
            ) : (
              <Button variant="contained" color="primary" onClick={handleNext}>
                {t("common.next")}
              </Button>
            )}
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default ScenarioCreatePage;
