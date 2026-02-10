import React, { useState, useEffect } from "react";
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  CircularProgress,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  AccountCircle,
  Menu as MenuIcon,
  Home as HomeIcon,
  History as HistoryIcon,
  PlayArrow as PlayArrowIcon,
  Person as PersonIcon,
  EmojiEvents as EmojiEventsIcon,
} from "@mui/icons-material";
import { AuthService } from "../services/AuthService";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

interface HeaderProps {
  // showBackButton?: boolean; // 現在は未使用
  pageTitle?: string;
}

/**
 * アプリケーションヘッダーコンポーネント
 */
const Header: React.FC<HeaderProps> = ({ pageTitle }) => {
  const { t } = useTranslation();
  const defaultTitle = t("home.title");
  const navigate = useNavigate();
  const authService = AuthService.getInstance();
  const [currentUser, setCurrentUser] = useState<{
    name: string;
    email: string;
    preferredUsername?: string;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMenuOpen = Boolean(anchorEl);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // ユーザー情報を非同期で取得
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await authService.getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error(t("errors.auth"), error);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [t, authService]);

  // メニューを開く
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  // メニューを閉じる
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // プロフィールページに移動
  const handleProfileClick = () => {
    handleMenuClose();
    navigate("/profile");
  };

  // ログアウト処理
  const handleLogout = async () => {
    handleMenuClose();
    try {
      await authService.logout();
      navigate("/");
      window.location.reload(); // アプリケーションをリロードして認証状態をリセット
    } catch (error) {
      console.error(t("errors.logout"), error);
    }
  };

  // 前の画面に戻る
  // 前のページに戻る機能（未使用のため削除）
  // const handleGoBack = () => {
  //   navigate(-1);
  // };

  // ホーム画面に移動
  const handleHomeClick = () => {
    navigate("/");
    setDrawerOpen(false);
  };

  // シナリオ選択画面に移動
  const handleScenariosClick = () => {
    navigate("/scenarios");
    setDrawerOpen(false);
  };

  // 履歴画面に移動
  const handleHistoryClick = () => {
    navigate("/history");
    setDrawerOpen(false);
  };

  // ランキング画面に移動
  const handleRankingsClick = () => {
    navigate("/rankings");
    setDrawerOpen(false);
  };

  // ドロワーを開閉
  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  // ユーザー名の表示用（優先順位：preferredUsername > name > メールアドレス）
  const displayName =
    currentUser?.preferredUsername ||
    currentUser?.name ||
    t("auth.notLoggedIn");

  // ナビゲーションの描画
  const drawerContent = (
    <Box sx={{ width: 250 }} role="presentation">
      <List>
        <ListItemButton onClick={handleHomeClick}>
          <ListItemIcon>
            <HomeIcon />
          </ListItemIcon>
          <ListItemText primary={t("navigation.home")} />
        </ListItemButton>
        <ListItemButton onClick={handleScenariosClick}>
          <ListItemIcon>
            <PlayArrowIcon />
          </ListItemIcon>
          <ListItemText primary={t("navigation.scenarios")} />
        </ListItemButton>
        <ListItemButton onClick={handleHistoryClick}>
          <ListItemIcon>
            <HistoryIcon />
          </ListItemIcon>
          <ListItemText primary={t("navigation.history")} />
        </ListItemButton>
        <ListItemButton onClick={handleRankingsClick}>
          <ListItemIcon>
            <EmojiEventsIcon />
          </ListItemIcon>
          <ListItemText primary={t("navigation.rankings")} />
        </ListItemButton>
      </List>
      <Divider />
      <List>
        <ListItemButton onClick={handleProfileClick}>
          <ListItemIcon>
            <PersonIcon />
          </ListItemIcon>
          <ListItemText primary={t("navigation.profile")} />
        </ListItemButton>
        {currentUser && (
          <ListItemButton onClick={handleLogout}>
            <ListItemIcon>
              <AccountCircle />
            </ListItemIcon>
            <ListItemText primary={t("auth.signOut")} />
          </ListItemButton>
        )}
      </List>
    </Box>
  );

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={toggleDrawer}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              cursor: "pointer",
              "&:hover": {
                opacity: 0.8,
              },
              transition: "all 0.2s ease",
              userSelect: "none", // テキスト選択を防止
            }}
            onClick={handleHomeClick}
          >
            {pageTitle || defaultTitle}
          </Typography>

          {!isMobile && (
            <Box sx={{ display: "flex", mx: 2 }}>
              <Button
                color="inherit"
                onClick={handleHomeClick}
                sx={{ mx: 0.5 }}
              >
                {t("navigation.home")}
              </Button>
              <Button
                color="inherit"
                onClick={handleScenariosClick}
                sx={{ mx: 0.5 }}
              >
                {t("navigation.scenarios")}
              </Button>
              <Button
                color="inherit"
                onClick={handleHistoryClick}
                sx={{ mx: 0.5 }}
              >
                {t("navigation.history")}
              </Button>
              <Button
                color="inherit"
                onClick={handleRankingsClick}
                sx={{ mx: 0.5 }}
              >
                {t("navigation.rankings")}
              </Button>
            </Box>
          )}

          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Box sx={{ mr: 2 }}>
              <LanguageSwitcher />
            </Box>

            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : currentUser ? (
              <>
                <Typography
                  variant="body2"
                  sx={{
                    mr: 1,
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  {displayName}
                </Typography>
                <IconButton
                  size="large"
                  edge="end"
                  color="inherit"
                  aria-label="user account"
                  aria-controls="menu-appbar"
                  aria-haspopup="true"
                  onClick={handleMenuOpen}
                >
                  <Avatar
                    sx={{ width: 32, height: 32, bgcolor: "secondary.main" }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </Avatar>
                </IconButton>
                <Menu
                  id="menu-appbar"
                  anchorEl={anchorEl}
                  keepMounted
                  open={isMenuOpen}
                  onClose={handleMenuClose}
                  transformOrigin={{ horizontal: "right", vertical: "top" }}
                  anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                >
                  <MenuItem onClick={handleProfileClick}>
                    {t("navigation.profile")}
                  </MenuItem>
                  <MenuItem onClick={handleLogout}>
                    {t("auth.signOut")}
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <IconButton
                size="large"
                edge="end"
                color="inherit"
                aria-label="user account"
              >
                <AccountCircle />
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {/* モバイル版ナビゲーションドロワー */}
      <Drawer anchor="left" open={drawerOpen} onClose={toggleDrawer}>
        {drawerContent}
      </Drawer>
    </>
  );
};

export default Header;
