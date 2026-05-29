/**
 * E2Eテスト: ビデオ録画機能のオン/オフ設定
 *
 * GitHub Issue #54「ビデオ録画機能のオン/オフ設定の追加」のE2Eテスト
 * dev環境（CloudFront）への接続を伴う統合テスト
 *
 * 検証観点:
 * 1. 設定モーダルに録画トグルが表示されること
 * 2. 録画オフ時にカメラプレビュー（VideoManager の video 要素）が非表示になること
 * 3. 録画オフ時に開始ボタンがカメラ初期化を待たず即有効化されること
 * 4. 録画設定がlocalStorageに永続化されること（リロード後も保持）
 * 5. セッション開始後は録画設定がロックされること
 *
 * 注意: セレクターはデプロイ済み環境で安定的に動作する aria-label / role ベースを使用する
 * （data-testid はビルド・デプロイ後にのみ反映されるため、ここでは依存しない）
 */
import { test, expect, Page, Locator } from "@playwright/test";
import { login, navigateToScenarioSelect } from "./helpers";

// 設定モーダルを開くボタン（i18n: ⚙️アイコン、日英のaria-labelに対応）
const SETTINGS_BUTTON_SELECTOR =
  'button[aria-label="設定を開く"], button[aria-label="Open settings"]';

/**
 * 録画トグルスイッチを取得
 * MUIのSwitchは role="switch" の input 要素としてレンダリングされ、
 * FormControlLabel のラベルテキストからアクセシブル名が算出される。
 * ラベルはi18nでON/OFF・日英により変化するため、すべてのパターンに対応する。
 *
 * @param page Playwrightのページオブジェクト
 */
function getRecordingToggle(page: Page): Locator {
  return page.getByRole("switch", {
    name: /ビデオ録画 (ON|OFF)|Video Recording (ON|OFF)/,
  });
}

/**
 * カメラプレビュー（VideoManager がレンダリングする video 要素）を取得
 * 録画オン時のみ会話画面に video 要素が表示される。
 *
 * @param page Playwrightのページオブジェクト
 */
function getCameraPreview(page: Page): Locator {
  return page.locator("main video");
}

// テスト実行前の共通セットアップ
test.beforeEach(async ({ page }) => {
  await login(page);
});

/**
 * シナリオ選択から会話ページへ遷移するヘルパー
 *
 * @param page Playwrightのページオブジェクト
 */
async function navigateToConversationPage(page: Page): Promise<void> {
  await navigateToScenarioSelect(page);
  const startButton = page
    .locator('button:has-text("このシナリオで開始")')
    .first();
  await expect(startButton).toBeVisible();
  await startButton.click();
  await page.waitForURL(/\/conversation\//);
}

/**
 * 設定モーダルを開くヘルパー
 *
 * @param page Playwrightのページオブジェクト
 */
async function openSettingsModal(page: Page): Promise<void> {
  const settingsButton = page.locator(SETTINGS_BUTTON_SELECTOR).first();
  await expect(settingsButton).toBeVisible({ timeout: 15000 });
  await settingsButton.click();

  // 設定ダイアログが表示されるまで待機
  const settingsDialog = page.locator('[role="dialog"]');
  await expect(settingsDialog.first()).toBeVisible({ timeout: 10000 });

  // 録画トグルが表示されるまで待機
  await expect(getRecordingToggle(page)).toBeVisible({ timeout: 10000 });
}

test.describe("ビデオ録画オン/オフ設定", () => {
  test.describe("設定パネルの表示", () => {
    test("設定モーダルに録画トグルが表示されること", async ({ page }) => {
      // 既定状態（録画オン）から開始するため設定をクリア
      await navigateToScenarioSelect(page);
      await page.evaluate(() =>
        window.localStorage.removeItem("videoRecordingEnabled"),
      );

      await navigateToConversationPage(page);
      await openSettingsModal(page);

      // 録画トグルスイッチが表示されていることを確認
      const recordingToggle = getRecordingToggle(page);
      await expect(recordingToggle).toBeVisible();

      // 既定では録画オン（チェック済み）であることを確認
      await expect(recordingToggle).toBeChecked();
    });
  });

  test.describe("録画オフ時の挙動", () => {
    test("録画をオフにするとカメラプレビューが非表示になること", async ({
      page,
    }) => {
      // 既定状態（録画オン）から開始するため設定をクリア
      await navigateToScenarioSelect(page);
      await page.evaluate(() =>
        window.localStorage.removeItem("videoRecordingEnabled"),
      );

      await navigateToConversationPage(page);

      // 既定（録画オン）ではカメラプレビュー（video要素）が存在する
      const cameraPreview = getCameraPreview(page);
      await expect(cameraPreview).toHaveCount(1, { timeout: 10000 });

      // 設定モーダルを開いて録画をオフに切り替え
      await openSettingsModal(page);
      const recordingToggle = getRecordingToggle(page);
      await recordingToggle.uncheck();
      await expect(recordingToggle).not.toBeChecked();

      // モーダルを閉じる（Escapeキー）
      await page.keyboard.press("Escape");

      // カメラプレビュー（video要素）がDOMから消えることを確認
      await expect(cameraPreview).toHaveCount(0, { timeout: 10000 });
    });

    test("録画オフ時は開始ボタンがカメラ初期化を待たず即有効になること", async ({
      page,
    }) => {
      // 事前にlocalStorageで録画オフを設定（カメラ初期化を一切待たない状態を作る）
      await page.addInitScript(() => {
        window.localStorage.setItem("videoRecordingEnabled", "false");
      });

      await navigateToConversationPage(page);

      // 開始ボタンが即座に有効化されることを確認（カメラ初期化待ちが発生しない）
      const startButton = page.locator(
        '[data-testid="start-conversation-button"]',
      );
      await expect(startButton).toBeVisible({ timeout: 15000 });
      await expect(startButton).toBeEnabled({ timeout: 5000 });

      // ボタンラベルが「録画なし」表記になっていることを確認（日英対応）
      const buttonText = (await startButton.textContent()) || "";
      expect(
        buttonText.includes("録画なし") ||
        buttonText.includes("No Recording"),
      ).toBeTruthy();

      // カメラプレビュー（video要素）が表示されていないことを確認
      await expect(getCameraPreview(page)).toHaveCount(0);
    });
  });

  test.describe("設定の永続化", () => {
    test("録画オフ設定がリロード後も保持されること", async ({ page }) => {
      // 既定状態（録画オン）から開始するため設定をクリア
      await navigateToScenarioSelect(page);
      await page.evaluate(() =>
        window.localStorage.removeItem("videoRecordingEnabled"),
      );

      await navigateToConversationPage(page);

      // 録画をオフに切り替え
      await openSettingsModal(page);
      const recordingToggle = getRecordingToggle(page);
      await recordingToggle.uncheck();
      await expect(recordingToggle).not.toBeChecked();

      // localStorageに永続化されていることを確認
      const storedValue = await page.evaluate(() =>
        window.localStorage.getItem("videoRecordingEnabled"),
      );
      expect(storedValue).toBe("false");

      // ページをリロード（addInitScriptを使わないため設定は保持される）
      await page.reload();
      await page.waitForURL(/\/conversation\//);

      // リロード後、カメラプレビュー（video要素）が非表示のままであることを確認
      await expect(getCameraPreview(page)).toHaveCount(0, { timeout: 10000 });

      // 設定モーダルを再度開き、トグルがオフのままであることを確認
      await openSettingsModal(page);
      await expect(getRecordingToggle(page)).not.toBeChecked();
    });
  });

  test.describe("セッション開始後の設定ロック", () => {
    test("セッション開始後は録画トグルが無効化されること", async ({ page }) => {
      // 録画オフにして、カメラ初期化を待たず即座にセッション開始できる状態にする
      await page.addInitScript(() => {
        window.localStorage.setItem("videoRecordingEnabled", "false");
      });

      await navigateToConversationPage(page);

      // セッションを開始
      const startButton = page.locator(
        '[data-testid="start-conversation-button"]',
      );
      await expect(startButton).toBeEnabled({ timeout: 15000 });
      await startButton.click();

      // セッション開始を確認（セッション終了ボタンの表示）
      const endButton = page
        .locator(
          'button:has-text("セッション終了"), button:has-text("商談終了"), button:has-text("End Conversation")',
        )
        .first();
      await expect(endButton).toBeVisible({ timeout: 30000 });

      // 設定モーダルを開く
      await openSettingsModal(page);

      // セッション開始後は録画トグルが無効化（disabled）されていることを確認
      await expect(getRecordingToggle(page)).toBeDisabled();
    });
  });
});
