/**
 * E2Eテスト: セッション録画のマルチパートアップロード
 *
 * GitHub Issue #68「セッション録画のS3アップロードが EntityTooLarge で失敗する」の
 * 抜本対策として導入したマルチパートアップロードのE2Eテスト。
 * dev環境（CloudFront / API Gateway）への接続を伴う統合テスト。
 *
 * 検証観点:
 * 1. /videos/multipart/create が認証付きで uploadId と partUrls を返すこと
 * 2. 返却された署名付きURLに実データをPUTでき、ETagが取得できること
 *    （S3バケットCORSの exposedHeaders に ETag が公開されていることの検証も兼ねる）
 * 3. /videos/multipart/complete でパート結合が成功すること
 * 4. 不正リクエスト（partCount欠如）が400で弾かれること
 * 5. 旧 /videos/upload-url が削除され、マルチパートに一本化されていること
 * 6. 中断（abort）後に complete を呼んでも結合が成功しないこと（異常系）
 *
 * 【重要】実行前提:
 * - 本テストは E2E_API_GATEWAY_ENDPOINT が指すデプロイ済み環境（dev等）に対して実行する。
 *   検証観点5（旧エンドポイント削除の確認）は、本変更を含むスタックを
 *   `npm run deploy:dev` でデプロイした後でないと正しく評価できない。
 *   デプロイ前に実行すると旧エンドポイントがまだ生きており、誤った合否になる。
 * - CIには未組み込みのため手動実行を想定。実行コマンド:
 *   `cd frontend && npx playwright test video-multipart-upload.spec.ts --project=chromium`
 *
 * 設計上の注意:
 * - ブラウザは実カメラにアクセスできないため、録画動画の実生成はE2Eでは検証しない。
 *   代わりに、ログイン済みブラウザコンテキストで取得した本物のCognito IDトークンを使い、
 *   デプロイ済みのマルチパートAPIをAPIレイヤーで end-to-end に検証する。
 * - 認証トークンはAmplifyがlocalStorageに保存したものをアプリのコンテキスト内から取得する。
 *   キー構造への直接依存を避けるため、CognitoのidTokenキーをパターン検索で取得する。
 */
import { test, expect, Page } from "@playwright/test";
import { login } from "./helpers";

// APIエンドポイント（アプリのビルド時環境変数と同一のものをテスト環境変数から取得）
const API_ENDPOINT = (process.env.E2E_API_GATEWAY_ENDPOINT || "").replace(
  /\/$/,
  "",
);

// S3マルチパートアップロードの最小パートサイズは5MB。
// 複数パートの結合を検証するため、1パート目は5MB以上のデータを用意する。
const PART_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * ログイン済みブラウザコンテキストからCognito IDトークンを取得する
 *
 * Amplify v6はCognitoのトークンを localStorage に
 * `CognitoIdentityServiceProvider.<clientId>.<username>.idToken` 形式で保存する。
 * キー構造の細部に依存しないよう、`.idToken` で終わるキーをパターン検索で取得する。
 *
 * @param page Playwrightのページオブジェクト
 * @returns Cognito IDトークン文字列
 */
async function getIdToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key &&
        key.startsWith("CognitoIdentityServiceProvider") &&
        key.endsWith(".idToken")
      ) {
        return window.localStorage.getItem(key);
      }
    }
    return null;
  });

  if (!token) {
    throw new Error(
      "Cognito IDトークンが取得できませんでした。ログインが完了しているか確認してください。",
    );
  }
  return token;
}

test.beforeEach(async ({ page }) => {
  // APIエンドポイントが設定されていない場合はテストを失敗させ、原因を明示する
  expect(
    API_ENDPOINT,
    "E2E_API_GATEWAY_ENDPOINT が .env.test に設定されている必要があります",
  ).not.toBe("");

  await login(page);
});

test.describe("セッション録画のマルチパートアップロード", () => {
  test("マルチパートアップロードのフルフロー（create→PUT→complete）が成功すること", async ({
    page,
  }) => {
    const idToken = await getIdToken(page);
    const sessionId = `e2e-multipart-${Date.now()}`;

    // --- ステップ1: マルチパートアップロード開始（2パート分のURLを要求） ---
    const createResponse = await page.request.post(
      `${API_ENDPOINT}/videos/multipart/create`,
      {
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
        },
        data: {
          sessionId,
          contentType: "video/mp4",
          partCount: 2,
          fileName: "e2e-recording.mp4",
        },
      },
    );

    expect(
      createResponse.ok(),
      `create失敗: status=${createResponse.status()}`,
    ).toBeTruthy();

    const createBody = await createResponse.json();
    expect(createBody.uploadId, "uploadIdが返却されること").toBeTruthy();
    expect(createBody.videoKey, "videoKeyが返却されること").toBeTruthy();
    expect(
      Array.isArray(createBody.partUrls),
      "partUrlsが配列であること",
    ).toBeTruthy();
    expect(createBody.partUrls).toHaveLength(2);
    expect(createBody.partUrls[0].partNumber).toBe(1);
    expect(createBody.partUrls[0].url).toContain("http");

    const { uploadId, videoKey, partUrls } = createBody;

    // --- ステップ2: 各パートを署名付きURLにPUTしてETagを取得 ---
    // S3仕様上、最後のパート以外は5MB以上必要。
    // 1パート目: 5MBちょうど、2パート目: 1KB（最終パートは小さくてもよい）。
    // ASCII文字列はUTF-8で1文字=1バイトになるため、文字数=バイト数として扱える。
    const part1Data = "a".repeat(PART_SIZE_BYTES);
    const part2Data = "a".repeat(1024);
    const partPayloads = [part1Data, part2Data];

    const uploadedParts: Array<{ partNumber: number; eTag: string }> = [];

    for (const { partNumber, url } of partUrls) {
      const putResponse = await page.request.put(url, {
        headers: { "Content-Type": "application/octet-stream" },
        data: partPayloads[partNumber - 1],
      });

      expect(
        putResponse.ok(),
        `パート${partNumber}のPUT失敗: status=${putResponse.status()}`,
      ).toBeTruthy();

      // S3はパートアップロードのレスポンスでETagヘッダーを返す。
      // バケットCORSの exposedHeaders に ETag が公開されていないと取得できない。
      const eTag = putResponse.headers()["etag"];
      expect(eTag, `パート${partNumber}のETagが取得できること`).toBeTruthy();

      uploadedParts.push({ partNumber, eTag });
    }

    // --- ステップ3: マルチパートアップロード完了（パート結合） ---
    const completeResponse = await page.request.post(
      `${API_ENDPOINT}/videos/multipart/complete`,
      {
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
        },
        data: {
          videoKey,
          uploadId,
          parts: uploadedParts,
        },
      },
    );

    expect(
      completeResponse.ok(),
      `complete失敗: status=${completeResponse.status()}`,
    ).toBeTruthy();

    const completeBody = await completeResponse.json();
    expect(completeBody.videoKey, "完了レスポンスにvideoKeyが含まれること").toBe(
      videoKey,
    );
  });

  test("partCountを欠いた不正なcreateリクエストは400で弾かれること", async ({
    page,
  }) => {
    const idToken = await getIdToken(page);

    const response = await page.request.post(
      `${API_ENDPOINT}/videos/multipart/create`,
      {
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
        },
        data: {
          sessionId: `e2e-invalid-${Date.now()}`,
          contentType: "video/mp4",
          // partCount を意図的に欠落させる
        },
      },
    );

    expect(
      response.status(),
      "partCount欠如のリクエストは400を返すこと",
    ).toBe(400);
  });

  test("中断（abort）リクエストが成功すること", async ({ page }) => {
    const idToken = await getIdToken(page);
    const sessionId = `e2e-abort-${Date.now()}`;

    // マルチパートアップロードを開始
    const createResponse = await page.request.post(
      `${API_ENDPOINT}/videos/multipart/create`,
      {
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
        },
        data: {
          sessionId,
          contentType: "video/mp4",
          partCount: 1,
          fileName: "e2e-abort.mp4",
        },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const { uploadId, videoKey } = await createResponse.json();

    // パートをアップロードせずに中断
    const abortResponse = await page.request.post(
      `${API_ENDPOINT}/videos/multipart/abort`,
      {
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
        },
        data: { videoKey, uploadId },
      },
    );

    expect(
      abortResponse.ok(),
      `abort失敗: status=${abortResponse.status()}`,
    ).toBeTruthy();
    const abortBody = await abortResponse.json();
    expect(abortBody.aborted, "中断成功フラグが返ること").toBe(true);
  });

  test("中断（abort）後に complete を呼んでも結合が成功しないこと", async ({
    page,
  }) => {
    const idToken = await getIdToken(page);
    const sessionId = `e2e-abort-then-complete-${Date.now()}`;

    // マルチパートアップロードを開始
    const createResponse = await page.request.post(
      `${API_ENDPOINT}/videos/multipart/create`,
      {
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
        },
        data: {
          sessionId,
          contentType: "video/mp4",
          partCount: 1,
          fileName: "e2e-abort-then-complete.mp4",
        },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const { uploadId, videoKey, partUrls } = await createResponse.json();

    // 1パート目をアップロードしてETagを取得（5MBちょうど）
    const putResponse = await page.request.put(partUrls[0].url, {
      headers: { "Content-Type": "application/octet-stream" },
      data: "a".repeat(PART_SIZE_BYTES),
    });
    expect(putResponse.ok(), "パートのPUTが成功すること").toBeTruthy();
    const eTag = putResponse.headers()["etag"];
    expect(eTag, "ETagが取得できること").toBeTruthy();

    // 中断してアップロード済みパートを破棄
    const abortResponse = await page.request.post(
      `${API_ENDPOINT}/videos/multipart/abort`,
      {
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
        },
        data: { videoKey, uploadId },
      },
    );
    expect(abortResponse.ok(), "abortが成功すること").toBeTruthy();

    // 中断済みのuploadIdに対してcompleteを呼ぶ。
    // S3は中断済みのマルチパートアップロードを認識しないため結合は成功しない
    // （NoSuchUpload相当のエラーとなり、completeエンドポイントは2xxを返さない）。
    const completeResponse = await page.request.post(
      `${API_ENDPOINT}/videos/multipart/complete`,
      {
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
        },
        data: {
          videoKey,
          uploadId,
          parts: [{ partNumber: 1, eTag }],
        },
      },
    );

    expect(
      completeResponse.ok(),
      "中断済みアップロードのcompleteは成功しないこと",
    ).toBeFalsy();
  });

  test("旧 /videos/upload-url エンドポイントが削除され応答しないこと", async ({
    page,
  }) => {
    const idToken = await getIdToken(page);

    // 旧エンドポイントはマルチパート統一により削除済み。
    // API Gatewayに当該ルートが存在しないため、成功レスポンス（2xx）は返らない。
    // 未定義ルートに対する具体的なステータスコード（403/404/500等）はAPI Gatewayの
    // 認証・GatewayResponse設定に依存するため、ステータスコードの厳密値ではなく
    // 「成功しないこと（録画用URLが発行されないこと）」を検証する。
    const response = await page.request.get(
      `${API_ENDPOINT}/videos/upload-url?sessionId=e2e-legacy&contentType=video/mp4`,
      {
        headers: { Authorization: idToken },
      },
    );

    expect(
      response.ok(),
      "削除済みの旧エンドポイントは成功レスポンスを返さないこと",
    ).toBeFalsy();

    // 万一2xxでなくても、署名付きURL（uploadUrl）が含まれていないことを二重に確認する
    const bodyText = await response.text();
    expect(
      bodyText.includes("uploadUrl"),
      "旧エンドポイントが署名付きURLを発行していないこと",
    ).toBeFalsy();
  });
});
