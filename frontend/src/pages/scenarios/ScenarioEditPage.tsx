import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { AvatarService } from "../../services/AvatarService";
import { useTranslation } from "react-i18next";

// ステップコンポーネントをインポート
import BasicInfoStep from "./creation/BasicInfoStep";
import NPCInfoStep from "./creation/NPCInfoStep";
import GoalsStep from "./creation/GoalsStep";
import PdfFilesStep from "./creation/PdfFilesStep";
import SharingStep from "./creation/SharingStep";
import PreviewStep from "./creation/PreviewStep";
import { DifficultyLevel } from "../../types/api";

// シナリオ編集ページ
const ScenarioEditPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const apiService = ApiService.getInstance();

  // ステップ管理
  const [activeStep, setActiveStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardrailsList, setGuardrailsList] = useState<
    Array<{
      arn: string;
      id: string;
      name: string;
      description: string;
    }>
  >([]);

  // アバター・音声モデル管理
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [voiceId, setVoiceId] = useState<string>("");
  const [existingAvatarId, setExistingAvatarId] = useState<string | undefined>(undefined);
  const [existingAvatarFileName, setExistingAvatarFileName] = useState<string | undefined>(undefined);
  // CR-010: フィールドレベルバリデーションエラー
  const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({});

  // フォームデータ
  const [formData, setFormData] = useState({
    // 基本情報
    scenarioId: "",
    title: "",
    description: "",
    difficulty: "normal" as DifficultyLevel,
    category: "",
    language: "ja", // デフォルトは日本語
    maxTurns: 10, // デフォルト値を設定

    // NPC情報
    npc: {
      name: "",
      role: "",
      company: "",
      personality: [] as string[],
      description: "",
    },

    // メトリクス
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

    // 設定
    visibility: "private" as "public" | "private" | "shared",
    sharedWithUsers: [] as string[],
    guardrail: "",
    initialMessage: "",
  });

  // 初期化処理
  useEffect(() => {
    if (!scenarioId) {
      setError(t("scenarios.edit.error.noScenarioId"));
      setIsLoading(false);
      return;
    }

    // シナリオデータとGuardrailsを読み込む
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Guardrailsのロード
        const guardrails = await apiService.getGuardrails();
        setGuardrailsList(guardrails);

        // シナリオデータのロード
        const scenarioData = await apiService.getScenarioDetail(scenarioId);

        // フォームデータを設定
        setFormData({
          scenarioId: scenarioData.scenarioId,
          title: scenarioData.title || "",
          description: scenarioData.description || "",
          difficulty: scenarioData.difficulty,
          category: scenarioData.category || scenarioData.industry || "",
          language: scenarioData.language || "ja",
          maxTurns: scenarioData.maxTurns || 10,

          npc: {
            name: scenarioData.npc?.name || scenarioData.npcInfo?.name || "",
            role: scenarioData.npc?.role || scenarioData.npcInfo?.role || "",
            company:
              scenarioData.npc?.company || scenarioData.npcInfo?.company || "",
            personality:
              scenarioData.npc?.personality ||
              scenarioData.npcInfo?.personality ||
              [],
            description:
              scenarioData.npc?.description ||
              scenarioData.npcInfo?.description ||
              "",
          },

          initialMetrics: {
            angerLevel: Number(scenarioData.initialMetrics?.angerLevel) || 1,
            trustLevel: Number(scenarioData.initialMetrics?.trustLevel) || 3,
            progressLevel:
              Number(scenarioData.initialMetrics?.progressLevel) || 2,
          },

          // PDF資料情報
          pdfFiles: scenarioData.pdfFiles || [],

          goals: (scenarioData.goals || []).map((goal) => ({
            id: goal.id,
            description: goal.description,
            isRequired: goal.isRequired ?? true,
            priority: Number(goal.priority) || 3,
            criteria: goal.criteria || [],
          })),
          visibility: scenarioData.visibility || "private",
          sharedWithUsers: scenarioData.sharedWithUsers || [],
          guardrail: scenarioData.guardrail || "",
          initialMessage: scenarioData.initialMessage || "",
        });

        // voiceIdとavatarIdを復元
        const loadedVoiceId = scenarioData.npc?.voiceId || scenarioData.npcInfo?.voiceId || "";
        setVoiceId(loadedVoiceId);
        if (scenarioData.avatarId) {
          setExistingAvatarId(scenarioData.avatarId);
          // ファイル名はアバターIDから推定（表示用）
          setExistingAvatarFileName(scenarioData.avatarId);
        }

        setIsLoading(false);
      } catch (error) {
        console.error("データ読み込みエラー:", error);
        setError(
          error instanceof Error
            ? error.message
            : t("scenarios.edit.error.loadFailed"),
        );
        setIsLoading(false);
      }
    };

    loadData();
  }, [scenarioId, t, apiService]);

  // ステップの定義
  const steps = [
    {
      label: t("scenarios.create.steps.basicInfo"),
      component: (
        <BasicInfoStep
          formData={formData}
          updateFormData={(data) => setFormData({ ...formData, ...data })}
          isEditMode={true}
        />
      ),
    },
    {
      label: t("scenarios.create.steps.npcInfo"),
      component: (
        <NPCInfoStep
          formData={{ ...formData, npc: formData.npc, language: formData.language }}
          updateFormData={(npcData) => {
            // initialMessageが単独で更新される場合と、NPCフィールドが更新される場合を適切に処理
            if ('initialMessage' in npcData && Object.keys(npcData).length === 1) {
              // initialMessageのみの更新の場合
              setFormData({
                ...formData,
                initialMessage: npcData.initialMessage || "",
              });
            } else {
              // NPCフィールドが含まれている場合（従来の処理）
              const { initialMessage, ...npcFields } = npcData;
              setFormData({
                ...formData,
                npc: { ...formData.npc, ...npcFields },
                ...(initialMessage !== undefined && { initialMessage }),
              });
            }
          }}
          validationErrors={validationErrors}
          avatarFile={avatarFile}
          avatarFileName={avatarFile?.name || existingAvatarFileName}
          onAvatarFileChange={(file) => {
            setAvatarFile(file);
            if (file === null) {
              // ファイル削除時は既存アバター情報もクリア
              setExistingAvatarFileName(undefined);
            }
          }}
          voiceId={voiceId}
          onVoiceIdChange={setVoiceId}
        />
      ),
    },
    {
      label: t("scenarios.create.steps.goals"),
      component: (
        <GoalsStep
          formData={formData}
          updateFormData={(data) => setFormData({ ...formData, ...data })}
        />
      ),
    },
    {
      label: t("scenarios.create.steps.pdfs") || "PDF資料",
      component: (
        <PdfFilesStep
          formData={{
            scenarioId: scenarioId,
            pdfFiles: formData.pdfFiles,
          }}
          updateFormData={(data) =>
            setFormData({
              ...formData,
              pdfFiles: data.pdfFiles || formData.pdfFiles,
            })
          }
        />
      ),
    },
    {
      label: t("scenarios.create.steps.sharing"),
      component: (
        <SharingStep
          formData={formData}
          guardrailsList={guardrailsList}
          updateFormData={(data) => setFormData({ ...formData, ...data })}
        />
      ),
    },
    {
      label: t("scenarios.create.steps.preview"),
      component: <PreviewStep formData={formData} />,
    },
  ];

  // 次のステップへ
  const handleNext = () => {
    // NPC情報ステップ（ステップ1）でvoiceIdの必須バリデーション
    // CR-010: Create画面と同じフィールドレベルバリデーションに統一
    if (activeStep === 1) {
      if (!voiceId) {
        setValidationErrors({ voiceId: "scenarios.validation.voiceIdRequired" });
        setError(null);
        return;
      }
      setValidationErrors({});
      setError(null);
    }
    setActiveStep((prevStep) => prevStep + 1);
  };

  // 前のステップへ
  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  // シナリオの更新
  const handleSubmit = async () => {
    if (!scenarioId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // アバターアップロード/置き換え処理
      let avatarId: string | undefined = existingAvatarId;
      const avatarService = AvatarService.getInstance();

      if (avatarFile) {
        // 新しいファイルがある場合：先に新アバターをアップロード → 成功後に旧アバターを削除
        const createResult = await avatarService.createAvatar(
          avatarFile.name,
          avatarFile.name.replace(/\.vrm$/i, ""),
          "application/octet-stream",
        );
        await avatarService.uploadVrmFile(
          createResult.uploadUrl,
          createResult.formData,
          avatarFile,
        );
        await avatarService.confirmUpload(createResult.avatarId);
        avatarId = createResult.avatarId;

        // 新アバターが確定してから旧アバターを削除
        if (existingAvatarId) {
          try {
            await avatarService.deleteAvatar(existingAvatarId);
          } catch (deleteError) {
            console.warn("旧アバター削除エラー（孤立リソース）:", deleteError);
          }
        }
      } else if (!avatarFile && !existingAvatarFileName && existingAvatarId) {
        // ファイルが削除された場合：旧アバターを削除
        try {
          await avatarService.deleteAvatar(existingAvatarId);
        } catch (deleteError) {
          console.warn("旧アバター削除エラー（続行）:", deleteError);
        }
        avatarId = undefined;
      }

      // APIリクエスト用にデータを整形
      const scenarioData = {
        title: formData.title,
        description: formData.description,
        difficulty: formData.difficulty,
        category: formData.category,
        maxTurns: formData.maxTurns,
        npc: { ...formData.npc, voiceId },
        initialMetrics: formData.initialMetrics,
        goals: formData.goals,
        pdfFiles: formData.pdfFiles?.length > 0 ? formData.pdfFiles : undefined,
        visibility: formData.visibility,
        guardrail: formData.guardrail,
        initialMessage: formData.initialMessage,
        ...(avatarId !== undefined ? { avatarId } : {}),
        ...(formData.visibility === "shared"
          ? { sharedWithUsers: formData.sharedWithUsers }
          : {}),
      };

      // APIでシナリオを更新
      await apiService.updateScenario(scenarioId, scenarioData);

      // 成功した場合
      navigate("/scenarios", {
        state: {
          success: true,
          message: t("scenarios.edit.success"),
          scenarioId,
        },
      });
    } catch (error) {
      console.error("シナリオ更新エラー:", error);
      setError(
        error instanceof Error
          ? error.message
          : t("scenarios.edit.error.unknown"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // キャンセル処理
  const handleCancel = () => {
    if (window.confirm(t("scenarios.edit.confirmCancel"))) {
      navigate("/scenarios");
    }
  };

  // ローディング表示
  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          {t("common.loading")}
        </Typography>
      </Container>
    );
  }

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
          {t("scenarios.edit.title")}
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
        <Box sx={{ mt: 2, mb: 4 }}>{steps[activeStep].component}</Box>

        {/* ナビゲーションボタン */}
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
          <Button
            variant="outlined"
            onClick={activeStep === 0 ? handleCancel : handleBack}
            sx={{ mr: 1 }}
            disabled={isSubmitting}
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
                {isSubmitting ? t("common.saving") : t("scenarios.edit.save")}
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

export default ScenarioEditPage;
