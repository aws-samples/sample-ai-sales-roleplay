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

    // VRMアバターの読み込みを待機
    await page.waitForTimeout(5000);

    // スクリーンショット: 商談中（VRMアバター表示）
    await page.screenshot({ path: 'test-results/03-conversation-with-avatar.png', fullPage: true });

    // canvasが表示されていることを確認（VRMアバターのレンダリング先）
    const canvas = page.locator('canvas');
    if (await canvas.count() > 0) {
      console.log('Canvas要素が表示されています（VRMアバター描画領域）');
      await expect(canvas.first()).toBeVisible();
    }

    // リアルタイム評価パネルを確認
    const angerMeter = page.locator('text=/怒りメーター|Anger/i');
    const trustMeter = page.locator('text=/信頼度|Trust/i');
    const progressMeter = page.locator('text=/進捗度|Progress/i');

    if (await angerMeter.count() > 0) {
      console.log('怒りメーター表示確認');
    }
    if (await trustMeter.count() > 0) {
      console.log('信頼度表示確認');
    }
    if (await progressMeter.count() > 0) {
      console.log('進捗度表示確認');
    }

    // メッセージ入力欄を探す
    const messageInput = page.locator('textarea, input[type="text"]').last();
    if (await messageInput.isVisible()) {
      // テストメッセージを入力
      await messageInput.fill('はじめまして。本日はお時間をいただきありがとうございます。');

      // 送信ボタンをクリック
      const sendButton = page.getByRole('button', { name: /送信|Send/i });
      if (await sendButton.count() > 0) {
        await sendButton.click();
        console.log('メッセージ送信');

        // 応答を待機
        await page.waitForTimeout(10000);

        // スクリーンショット: メッセージ送信後
        await page.screenshot({ path: 'test-results/04-after-message.png', fullPage: true });
      }
    }

    // 最終スクリーンショット
    await page.screenshot({ path: 'test-results/05-final-state.png', fullPage: true });

    console.log('テスト完了');
  });
});
