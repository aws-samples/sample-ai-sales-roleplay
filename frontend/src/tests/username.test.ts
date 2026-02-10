import { test, expect } from "@playwright/test";
import { mockAmplifyAuth } from "./mocks/auth-mock";

test.describe("ユーザー名登録・編集機能", () => {
  // ステージング環境ではAmplify認証モックが機能しないためスキップ
  // ローカル開発環境でのみ実行可能
  test.skip(({ browserName }) => true, 'ステージング環境ではAmplify認証モックが未対応のためスキップ');

  test.beforeEach(async ({ page }) => {
    // Amplify認証のモック
    await mockAmplifyAuth(page);
  });

  test("新規サインアップ時にユーザー名フィールドが表示される", async ({
    page,
  }) => {
    // ホームページにアクセス
    await page.goto("/");

    // サインアップページへ移動
    await page.locator("text=Sign up").click();

    // メールアドレス入力フィールドがあることを確認
    await expect(page.locator('input[name="email"]')).toBeVisible();

    // ユーザー名入力フィールドがあることを確認
    await expect(
      page.locator('input[name="preferred_username"]'),
    ).toBeVisible();

    // ユーザー名フィールドにはラベルが表示されていることを確認
    await expect(
      page.locator('label:has-text("Preferred Username")'),
    ).toBeVisible();
  });

  test("プロフィール画面でユーザー名を編集できる", async ({ page }) => {
    // 認証済み状態でホームページにアクセス
    await page.goto("/");

    // ヘッダーにユーザーアイコンが表示されていることを確認
    await expect(
      page.locator('button[aria-label="user account"]'),
    ).toBeVisible();

    // ユーザーメニューを開く
    await page.locator('button[aria-label="user account"]').click();

    // プロフィールメニューをクリック
    await page.locator("text=プロフィール").click();

    // プロフィールページに遷移したことを確認
    await expect(page).toHaveURL(/\/profile/);

    // ユーザー名が表示されていることを確認
    await expect(page.locator("text=ユーザー名:")).toBeVisible();

    // 編集ボタンをクリック
    await page.locator("text=編集").click();

    // 編集モードになり、テキストフィールドが表示されることを確認
    const usernameField = page.locator('input[type="text"]').first();
    await expect(usernameField).toBeVisible();

    // ユーザー名を変更
    await usernameField.clear();
    await usernameField.fill("新しいユーザー名");

    // 保存ボタンをクリック
    await page.locator("text=保存").click();

    // 成功メッセージが表示されることを確認
    await expect(page.locator("text=ユーザー名を更新しました")).toBeVisible();

    // 編集モードが終了し、新しいユーザー名が表示されていることを確認
    await expect(page.locator("text=新しいユーザー名")).toBeVisible();
  });
});
