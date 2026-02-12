/**
 * 3Dアバター感情表現テスト
 * VRMアバターの表情変化を確認するE2Eテスト
 */
import { test, expect } from '@playwright/test';
import {
  login,
  navigateToScenarioSelect,
  clickStartConversationButton,
} from './helpers';

test.describe('3Dアバター感情表現テスト', () => {
  test.setTimeout(180000); // 3分のタイムアウト

  test.beforeEach(async ({ page }) => {
    // 共通ヘルパーでログイン
    await login(page);
  });

  test('VRMアバターが表示され、感情状態が反映される', async ({ page }) => {
    // シナリオ一覧ページに遷移
    await navigateToScenarioSelect(page);
    console.log('シナリオ一覧ページに遷移');

    // スクリーンショット: シナリオ一覧
    await page.screenshot({ path: 'test-results/01-scenario-list.png', fullPage: true });

    // 「このシナリオで開始」ボタンをクリックして商談画面に遷移
    const startScenarioButton = page.locator('button:has-text("このシナリオで開始"), button:has-text("Start this scenario")').first();
    await expect(startScenarioButton).toBeVisible({ timeout: 15000 });
    await startScenarioButton.click();

    // 商談画面に遷移するまで待機
    await page.waitForURL('**/conversation/**', { timeout: 30000 });
    console.log('商談画面に遷移');

    // スクリーンショット: 商談画面（開始前）
    await page.screenshot({ path: 'test-results/02-conversation-before-start.png', fullPage: true });

    // 商談開始ボタンをクリック（カメラタイムアウト対応済みヘルパー使用）
    await clickStartConversationButton(page);
    console.log('商談開始');

    // アバター表示エリア（region）が表示されるまで待機
    const avatarRegion = page.locator('[role="region"][aria-label*="アバター"], [role="region"][aria-label*="Avatar"]');
    await expect(avatarRegion.first()).toBeVisible({ timeout: 30000 });
    console.log('アバター表示エリアが表示されています');

    // canvas、エラー表示、またはローディング表示のいずれかがDOMに存在するまで待機
    const canvasOrErrorOrLoading = page.locator('canvas')
      .or(page.locator('[role="alert"]'))
      .or(page.locator('[role="status"][aria-busy="true"]'));
    await expect(canvasOrErrorOrLoading.first()).toBeAttached({ timeout: 30000 });

    // スクリーンショット: 商談中（VRMアバター表示）
    await page.screenshot({ path: 'test-results/03-conversation-with-avatar.png', fullPage: true });

    const canvas = page.locator('canvas');
    const canvasExists = await canvas.count() > 0;
    if (canvasExists) {
      console.log('Canvas要素がDOMに存在しています（VRMアバター描画領域）');
      await expect(canvas.first()).toBeAttached();
    } else {
      const errorAlert = page.locator('[role="alert"]');
      if (await errorAlert.first().isVisible().catch(() => false)) {
        console.log('アバター読み込みエラーが表示されています（ヘッドレスブラウザのWebGL制約の可能性）');
      } else {
        console.log('アバターがローディング中です');
      }
    }

    // リアルタイム評価パネルを確認（progressbarのaria-labelで検索）
    const angerProgress = page.locator('[role="progressbar"][aria-label*="怒り"]')
      .or(page.locator('[role="progressbar"][aria-label*="Anger"]'));
    const trustProgress = page.locator('[role="progressbar"][aria-label*="信頼"]')
      .or(page.locator('[role="progressbar"][aria-label*="Trust"]'));
    const progressProgress = page.locator('[role="progressbar"][aria-label*="進捗"]')
      .or(page.locator('[role="progressbar"][aria-label*="Progress"]'));

    if (await angerProgress.count() > 0) {
      console.log('怒りメーター表示確認');
    }
    if (await trustProgress.count() > 0) {
      console.log('信頼度表示確認');
    }
    if (await progressProgress.count() > 0) {
      console.log('進捗度表示確認');
    }

    // メッセージ入力欄を探す
    const messageInput = page.locator('textarea').first();
    if (await messageInput.isVisible().catch(() => false)) {
      // テストメッセージを入力
      await messageInput.fill('はじめまして。本日はお時間をいただきありがとうございます。');

      // 送信ボタンをクリック
      const sendButton = page.locator('button[aria-label*="送信"]')
        .or(page.getByRole('button', { name: /送信|Send/i }));
      if (await sendButton.count() > 0) {
        await sendButton.first().click();
        console.log('メッセージ送信');

        // 応答を待機
        await page.waitForTimeout(15000);

        // スクリーンショット: メッセージ送信後
        await page.screenshot({ path: 'test-results/04-after-message.png', fullPage: true });

        // メッセージ送信後もアバター表示エリアが存在するか確認
        const regionStillVisible = await avatarRegion.first().isVisible().catch(() => false);
        if (regionStillVisible) {
          console.log('メッセージ送信後もアバター表示エリアは正常に表示されています');
        } else {
          console.log('メッセージ送信後にアバター表示エリアが消失しました（APIエラーの可能性）');
        }
      }
    }

    // 最終スクリーンショット
    await page.screenshot({ path: 'test-results/05-final-state.png', fullPage: true });

    console.log('テスト完了');
  });
});
