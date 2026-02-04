/**
 * E2Eテスト用認証ヘルパー
 *
 * ステージング環境のCognitoに対して実際のログインを行う
 */
import { Page, expect } from "@playwright/test";

// 環境変数から認証情報を取得
const TEST_USER_EMAIL = process.env.E2E_TEST_USER_EMAIL || "";
const TEST_USER_PASSWORD = process.env.E2E_TEST_USER_PASSWORD || "";

/**
 * 認証情報が設定されているかチェック
 */
export function validateAuthConfig(): void {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error(
      "E2Eテスト用の認証情報が設定されていません。" +
      ".env.test ファイルに E2E_TEST_USER_EMAIL と E2E_TEST_USER_PASSWORD を設定してください。"
    );
  }
}

/**
 * Cognitoログインを実行
 *
 * AWS Amplify UIのAuthenticatorコンポーネントを使用したログインフローを実行
 *
 * @param page Playwrightのページオブジェクト
 */
export async function login(page: Page): Promise<void> {
  validateAuthConfig();

  // ホームページにアクセス（未認証の場合はログイン画面が表示される）
  await page.goto("/");

  // ログインフォームが表示されるまで待機
  // AWS Amplify UIのAuthenticatorコンポーネントを想定
  const emailInput = page.locator('input[name="username"], input[type="email"]');
  const passwordInput = page.locator('input[name="password"], input[type="password"]');

  // ログインフォームが表示されているか確認
  const isLoginFormVisible = await emailInput.isVisible().catch(() => false);

  if (isLoginFormVisible) {
    // メールアドレスを入力
    await emailInput.fill(TEST_USER_EMAIL);

    // パスワードを入力
    await passwordInput.fill(TEST_USER_PASSWORD);

    // ログインボタンをクリック
    const submitButton = page.locator(
      'button[type="submit"]:has-text("Sign in"), button[type="submit"]:has-text("ログイン"), button[type="submit"]:has-text("サインイン")'
    );
    await submitButton.click();

    // ログイン完了を待機（ホームページのコンテンツが表示されるまで）
    // ホームページの要素が表示されることを確認
    const homeIndicator = page.locator('text=AI営業ロールプレイ')
      .or(page.locator('text=営業ロールプレイを開始'))
      .or(page.locator('button:has-text("ホーム")'));
    await expect(homeIndicator.first()).toBeVisible({ timeout: 30000 });
  } else {
    // 既にログイン済みの場合 - ホームページが表示されていることを確認
    const homeIndicator = page.locator('text=AI営業ロールプレイ')
      .or(page.locator('text=営業ロールプレイを開始'))
      .or(page.locator('button:has-text("ホーム")'));
    await expect(homeIndicator.first()).toBeVisible({ timeout: 10000 });
  }
}

/**
 * ログアウトを実行
 *
 * @param page Playwrightのページオブジェクト
 */
export async function logout(page: Page): Promise<void> {
  // ユーザーメニューを開く
  const userMenuButton = page.locator(
    'button[aria-label="user account"], button[aria-label="ユーザーアカウント"]'
  );

  if (await userMenuButton.isVisible()) {
    await userMenuButton.click();

    // ログアウトボタンをクリック
    const logoutButton = page.locator('text=ログアウト, text=Sign out');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();

      // ログアウト完了を待機（ログイン画面が表示されるまで）
      await expect(
        page.locator('input[name="username"], input[type="email"]')
      ).toBeVisible({ timeout: 10000 });
    }
  }
}

/**
 * 認証状態を確認
 *
 * @param page Playwrightのページオブジェクト
 * @returns ログイン済みの場合はtrue
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  // ユーザーメニューボタンが表示されているかで判定
  const userMenuButton = page.locator(
    'button[aria-label="user account"], button[aria-label="ユーザーアカウント"]'
  );
  return userMenuButton.isVisible();
}
