import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { SelectChangeEvent } from "@mui/material";
import {
  Container,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Box,
  Chip,
  Avatar,
  Divider,
  TextField,
  InputAdornment,
  FormControl,
  MenuItem,
  Select,
  Switch,
  FormControlLabel,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  PlayArrow as PlayIcon,
  Business as BusinessIcon,
  TrendingUp as TrendingUpIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Sort as SortIcon,
  StarBorder as StarBorderIcon,
  Star as StarIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";

import { ApiService } from "../services/ApiService";
import type { ScenarioInfo, DifficultyLevel } from "../types/api";

const ScenarioSelectPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("difficulty");
  const [favoriteScenarios, setFavoriteScenarios] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const apiService = ApiService.getInstance();

  // 業界一覧を取得（APIから取得したシナリオに基づいて）
  const categories = Array.from(
    new Set(scenarios.map((s) => s.category)),
  ).sort();

  // 難易度マッピング定義
  const DIFFICULTY_MAPPING: Record<string, DifficultyLevel[]> = {
    easy: ["easy"],
    normal: ["normal"],
    hard: ["hard", "expert"],
  };

  // 難易度フィルター用の選択肢
  const DIFFICULTY_FILTER_OPTIONS = [
    { value: "all", label: t("scenarios.filters.allLevels") },
    { value: "easy", label: t("scenarios.beginner") },
    { value: "normal", label: t("scenarios.intermediate") },
    { value: "hard", label: t("scenarios.advanced") },
  ];

  // 難易度表示用のマッピング
  const DIFFICULTY_DISPLAY_MAPPING: Record<DifficultyLevel, string> = {
    easy: t("scenarios.beginner"),
    normal: t("scenarios.intermediate"),
    hard: t("scenarios.advanced"),
    expert: t("scenarios.advanced"),
  };

  // 難易度色マッピング
  const DIFFICULTY_COLOR_MAPPING: Record<
    DifficultyLevel,
    "success" | "warning" | "error" | "default"
  > = {
    easy: "success",
    normal: "warning",
    hard: "error",
    expert: "error",
  };

  // シナリオデータをAPIから取得する関数
  const fetchScenarios = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getScenarios();
      if (response.scenarios) {
        setScenarios(response.scenarios);
      } else {
        setError(t("errors.noScenarios"));
      }
    } catch (err) {
      console.error("シナリオ取得エラー:", err);
      setError(
        err instanceof Error ? err.message : t("errors.failedToLoadScenarios"),
      );
    } finally {
      setLoading(false);
    }
  }, [apiService, t]);

  // 難易度表示用の変換関数
  const getDifficultyLabel = (difficulty: DifficultyLevel): string => {
    return DIFFICULTY_DISPLAY_MAPPING[difficulty] || difficulty;
  };

  // 現在のユーザーIDを取得する関数
  const fetchCurrentUser = React.useCallback(async () => {
    try {
      // AWS Cognitoから現在のユーザー情報を取得
      const { getCurrentUser } = await import("aws-amplify/auth");
      const user = await getCurrentUser();

      // ユーザーIDを設定（Cognitoのsub属性を使用）
      setCurrentUserId(user.userId);

      if (process.env.NODE_ENV !== "test") {
        console.log("現在のユーザーID:", user.userId);
      }
    } catch (err) {
      console.error("ユーザー情報取得エラー:", err);
      // 認証されていない場合はnullを設定
      setCurrentUserId(null);
    }
  }, []);

  // シナリオのオーナーかどうかを判定する関数
  const isScenarioOwner = (scenario: ScenarioInfo): boolean => {
    // 現在のユーザーIDが取得できていない場合はfalse
    if (!currentUserId) {
      if (process.env.NODE_ENV !== "test") {
        console.log(
          `オーナー判定: ユーザーIDが未取得のため false (scenario: ${scenario.scenarioId})`,
        );
      }
      return false;
    }

    // シナリオにcreatedByフィールドがある場合はそれを使用
    if (scenario.createdBy) {
      const isOwner = scenario.createdBy === currentUserId;
      if (process.env.NODE_ENV !== "test") {
        console.log(
          `オーナー判定: createdBy比較 ${isOwner} (scenario: ${scenario.scenarioId}, createdBy: ${scenario.createdBy}, currentUser: ${currentUserId})`,
        );
      }
      return isOwner;
    }

    // カスタムシナリオフラグがある場合はそれを使用
    if (scenario.isCustom !== undefined) {
      if (process.env.NODE_ENV !== "test") {
        console.log(
          `オーナー判定: isCustomフラグ ${scenario.isCustom} (scenario: ${scenario.scenarioId})`,
        );
      }
      return scenario.isCustom;
    }

    // フォールバック: シナリオIDにcustomが含まれている場合
    // （既存のカスタムシナリオとの互換性のため）
    const isCustomScenario = scenario.scenarioId.includes("custom");
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `オーナー判定: フォールバック判定 ${isCustomScenario} (scenario: ${scenario.scenarioId})`,
      );
    }
    return isCustomScenario;
  };

  // 初期化
  useEffect(() => {
    // ローカルストレージからお気に入りを読み込む
    const storedFavorites = localStorage.getItem("favoriteScenarios");
    if (storedFavorites) {
      setFavoriteScenarios(JSON.parse(storedFavorites));
    }

    // 現在のユーザー情報を取得してからシナリオデータを取得
    const initializeData = async () => {
      await fetchCurrentUser();
      await fetchScenarios();
    };

    initializeData();
  }, [fetchScenarios, fetchCurrentUser]);

  // フィルター変更ハンドラー
  const handleDifficultyFilterChange = (event: SelectChangeEvent) => {
    setDifficultyFilter(event.target.value);
  };

  const handleCategoryFilterChange = (event: SelectChangeEvent) => {
    setCategoryFilter(event.target.value);
  };

  // ソート順変更ハンドラー
  const handleSortOrderChange = (event: SelectChangeEvent) => {
    setSortOrder(event.target.value);
  };

  // お気に入り切り替えハンドラー
  const toggleFavorite = (scenarioId: string) => {
    const newFavorites = favoriteScenarios.includes(scenarioId)
      ? favoriteScenarios.filter((id) => id !== scenarioId)
      : [...favoriteScenarios, scenarioId];

    setFavoriteScenarios(newFavorites);
    localStorage.setItem("favoriteScenarios", JSON.stringify(newFavorites));
  };

  // シナリオをフィルター
  const filteredScenarios = scenarios.filter((scenario) => {
    // 検索クエリでフィルタリング
    const matchesSearch =
      searchQuery === "" ||
      scenario.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scenario.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (scenario.category &&
        scenario.category.toLowerCase().includes(searchQuery.toLowerCase()));

    // 難易度でフィルタリング
    const matchesDifficulty =
      difficultyFilter === "all" ||
      (DIFFICULTY_MAPPING[
        difficultyFilter as keyof typeof DIFFICULTY_MAPPING
      ] &&
        DIFFICULTY_MAPPING[
          difficultyFilter as keyof typeof DIFFICULTY_MAPPING
        ].includes(scenario.difficulty));

    // 業界でフィルタリング
    const matchesCategory =
      categoryFilter === "all" || scenario.category === categoryFilter;

    // お気に入りフィルタリング
    const matchesFavorites =
      !showFavoritesOnly || favoriteScenarios.includes(scenario.scenarioId);

    return (
      matchesSearch && matchesDifficulty && matchesCategory && matchesFavorites
    );
  });

  // シナリオをソート
  const sortedScenarios = [...filteredScenarios].sort((a, b) => {
    // お気に入りを先頭に
    if (
      favoriteScenarios.includes(a.scenarioId) &&
      !favoriteScenarios.includes(b.scenarioId)
    )
      return -1;
    if (
      !favoriteScenarios.includes(a.scenarioId) &&
      favoriteScenarios.includes(b.scenarioId)
    )
      return 1;

    // 選択されたソート順でさらにソート
    switch (sortOrder) {
      case "difficulty": {
        const difficultyOrder: Record<DifficultyLevel, number> = {
          easy: 0,
          normal: 1,
          hard: 2,
          expert: 3,
        };
        return (
          (difficultyOrder[a.difficulty] || 1) -
          (difficultyOrder[b.difficulty] || 1)
        );
      }
      case "industry":
        return (a.category || "").localeCompare(b.category || "");
      case "title":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  const getDifficultyColor = (difficulty: DifficultyLevel) => {
    return DIFFICULTY_COLOR_MAPPING[difficulty] || "default";
  };

  return (
    <>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box
          mb={4}
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Box>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              color="primary"
              fontWeight="bold"
            >
              {t("scenarios.title")}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t("scenarios.subtitle")}
            </Typography>
          </Box>
          {/* ボタングループ */}
          <Box sx={{ display: "flex", gap: 1 }}>
            {/* リロードボタン */}
            <Tooltip title={t("common.refresh")}>
              <IconButton
                onClick={() => fetchScenarios()}
                disabled={loading}
                color="primary"
                size="medium"
                sx={{
                  width: 48,
                  height: 48,
                  color: "primary.main",
                  border: "none",
                  boxShadow: "none",
                  backgroundColor: "transparent",
                  "&:hover": {
                    backgroundColor: "primary.main",
                    color: "white",
                  },
                  "&:disabled": {
                    color: "action.disabled",
                    backgroundColor: "transparent",
                  },
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>

            {/* シナリオ作成ボタン */}
            <Tooltip title={t("scenarios.create.button")}>
              <IconButton
                onClick={() => navigate("/scenarios/create")}
                color="primary"
                size="medium"
                sx={{
                  width: 48,
                  height: 48,
                  color: "primary.main",
                  border: "none",
                  boxShadow: "none",
                  backgroundColor: "transparent",
                  "&:hover": {
                    backgroundColor: "primary.main",
                    color: "white",
                  },
                }}
              >
                <AddIcon />
              </IconButton>
            </Tooltip>

            {/* シナリオ管理ボタン */}
            <Tooltip title={t("scenarios.management.button")}>
              <IconButton
                onClick={() => navigate("/scenarios/manage")}
                color="primary"
                size="medium"
                sx={{
                  width: 48,
                  height: 48,
                  color: "primary.main",
                  border: "none",
                  boxShadow: "none",
                  backgroundColor: "transparent",
                  "&:hover": {
                    backgroundColor: "primary.main",
                    color: "white",
                  },
                }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        {/* ローディング表示 */}
        {loading && (
          <Box display="flex" justifyContent="center" my={4}>
            <CircularProgress />
          </Box>
        )}

        {/* エラー表示 */}
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => fetchScenarios()}
              >
                {t("common.retry")}
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {/* 検索・フィルター */}
        <Box
          sx={{
            mb: 4,
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
            alignItems: "center",
          }}
        >
          <TextField
            placeholder={t("scenarios.searchPlaceholder")}
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ flexGrow: 1, minWidth: "250px" }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <FormControl size="small" sx={{ minWidth: "120px" }}>
            <Select
              value={difficultyFilter}
              onChange={handleDifficultyFilterChange}
              displayEmpty
              startAdornment={<FilterIcon fontSize="small" sx={{ mr: 0.5 }} />}
            >
              {DIFFICULTY_FILTER_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: "150px" }}>
            <Select
              value={categoryFilter}
              onChange={handleCategoryFilterChange}
              displayEmpty
              startAdornment={
                <BusinessIcon fontSize="small" sx={{ mr: 0.5 }} />
              }
            >
              <MenuItem value="all">
                {t("scenarios.filters.allIndustries")}
              </MenuItem>
              {categories.map((category) => (
                <MenuItem key={category} value={category}>
                  {category}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: "120px" }}>
            <Select
              value={sortOrder}
              onChange={handleSortOrderChange}
              displayEmpty
              startAdornment={<SortIcon fontSize="small" sx={{ mr: 0.5 }} />}
            >
              <MenuItem value="difficulty">
                {t("scenarios.sort.byDifficulty")}
              </MenuItem>
              <MenuItem value="industry">
                {t("scenarios.sort.byIndustry")}
              </MenuItem>
              <MenuItem value="title">{t("scenarios.sort.byTitle")}</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Switch
                checked={showFavoritesOnly}
                onChange={() => setShowFavoritesOnly(!showFavoritesOnly)}
                color="warning"
                size="small"
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <StarIcon
                  fontSize="small"
                  sx={{ color: "warning.main", mr: 0.5 }}
                />
                <Typography variant="body2">
                  {t("scenarios.filters.favoritesOnly")}
                </Typography>
              </Box>
            }
          />

          <Box sx={{ ml: "auto", display: "flex", alignItems: "center" }}>
            <Typography variant="body2" color="text.secondary" mr={1}>
              {t("scenarios.showingItems", { count: sortedScenarios.length })}
            </Typography>
          </Box>
        </Box>

        {/* シナリオが見つからない場合 */}
        {!loading && !error && filteredScenarios.length === 0 && (
          <Box sx={{ textAlign: "center", py: 5 }}>
            <Typography variant="h6" color="text.secondary">
              条件に一致するシナリオが見つかりません
            </Typography>
            <Typography variant="body2" color="text.secondary">
              検索条件やフィルターを変更してお試しください
            </Typography>
            <Button
              variant="contained"
              color="primary"
              size="medium"
              sx={{
                mt: 2,
                minHeight: 40,
                px: 3,
              }}
              onClick={() => {
                setSearchQuery("");
                setDifficultyFilter("all");
                setCategoryFilter("all");
              }}
            >
              フィルターをリセット
            </Button>
          </Box>
        )}

        {/* シナリオ一覧 - ローディング中とエラー時は表示しない */}
        {!loading && !error && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 3,
              justifyContent: "center",
            }}
          >
            {sortedScenarios.map((scenario) => (
              <Card
                key={scenario.scenarioId}
                sx={{
                  width: { xs: "100%", sm: "45%", lg: "30%" },
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  border: favoriteScenarios.includes(scenario.scenarioId)
                    ? "1px solid"
                    : "none",
                  borderColor: "warning.main",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: 4,
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  {/* シナリオヘッダー */}
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    mb={2}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        flexGrow: 1,
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(scenario.scenarioId);
                        }}
                        sx={{ mr: 1, color: "warning.main" }}
                      >
                        {favoriteScenarios.includes(scenario.scenarioId) ? (
                          <StarIcon />
                        ) : (
                          <StarBorderIcon />
                        )}
                      </IconButton>
                      <Typography variant="h6" component="h2" gutterBottom>
                        {scenario.title}
                      </Typography>
                    </Box>
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                    >
                      <Chip
                        label={getDifficultyLabel(scenario.difficulty)}
                        color={getDifficultyColor(scenario.difficulty)}
                        size="small"
                      />
                      {/* 管理画面へのリンク（オーナーのみ表示） */}
                      {isScenarioOwner(scenario) && (
                        <>
                          {/* シナリオ管理ページで編集・削除するように変更 */}
                        </>
                      )}
                    </Box>
                  </Box>

                  {/* シナリオ説明 */}
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {scenario.description}
                  </Typography>

                  {/* 業界・目標 */}
                  <Box mb={2}>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <BusinessIcon fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">
                        {t("scenarios.industry")}: {scenario.category || "-"}
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <TrendingUpIcon fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">
                        {t("scenarios.objectives")}:{" "}
                        {scenario.goals?.length || 0}
                        {t("scenarios.objectivesCount")}
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* NPC情報 */}
                  {scenario.npcInfo && (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        対話相手 (NPC)
                      </Typography>
                      <Box display="flex" alignItems="center" gap={2} mb={1}>
                        <Avatar
                          sx={{ width: 32, height: 32, fontSize: "1rem" }}
                        >
                          {scenario.npcInfo?.avatar ||
                            scenario.npcInfo?.role?.charAt(0) ||
                            "👤"}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {scenario.npcInfo.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {scenario.npcInfo.role} - {scenario.npcInfo.company}
                          </Typography>
                        </Box>
                      </Box>

                      {/* NPC性格 */}
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                        {scenario.npcInfo?.personality
                          ?.slice(0, 3)
                          .map((trait, index) => (
                            <Chip
                              key={index}
                              label={trait}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: "0.7rem",
                                height: "auto",
                                py: 0.5,
                              }}
                            />
                          )) || []}
                      </Box>
                    </Box>
                  )}
                </CardContent>

                <CardActions sx={{ justifyContent: "center", pb: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="medium"
                    fullWidth
                    startIcon={<PlayIcon />}
                    onClick={() =>
                      navigate(`/conversation/${scenario.scenarioId}`)
                    }
                    sx={{
                      mx: 2,
                      minHeight: 40,
                      fontWeight: "medium",
                    }}
                  >
                    {t("scenarios.startWithScenario")}
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Box>
        )}

        {/* フッター情報 */}
        <Box textAlign="center" mt={6} pt={3} borderTop="1px solid #eee">
          <Typography variant="body2" color="text.secondary" mb={1}>
            {t("scenarios.hints.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>
            {t("scenarios.hints.beginnerRecommendation")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("scenarios.hints.duration")}
          </Typography>
        </Box>
      </Container>
    </>
  );
};

export default ScenarioSelectPage;
