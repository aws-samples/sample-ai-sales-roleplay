import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

// .env.testファイルを読み込む
dotenv.config({ path: ".env.test" });

// ステージング環境URLを環境変数から取得（デフォルトはローカル開発環境）
const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";
const isStaging = baseURL !== "http://localhost:5173";

export default defineConfig({
  testDir: "./src/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  // テストタイムアウト設定（ステージング環境では長めに設定）
  timeout: isStaging ? 120000 : 30000,
  expect: {
    timeout: isStaging ? 15000 : 5000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    // スクリーンショット設定
    screenshot: "only-on-failure",
    // ビデオ録画設定（失敗時のみ）
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  // ローカル開発環境の場合のみwebServerを起動
  ...(isStaging
    ? {}
    : {
      webServer: {
        command: "npm run dev",
        port: 5173,
        reuseExistingServer: !process.env.CI,
      },
    }),
});
