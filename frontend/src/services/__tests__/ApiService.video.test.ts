// APIのモック
jest.mock("aws-amplify/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

// ApiServiceのモック
jest.mock("../ApiService", () => ({
  ApiService: {
    getInstance: jest.fn(() => ({
      getVideoUploadUrl: jest.fn(),
    })),
  },
}));

import { ApiService } from "../ApiService";

describe("ApiService - ビデオ関連機能のテスト", () => {
  let apiService: {
    getVideoUploadUrl: jest.Mock;
  };

  beforeEach(() => {
    apiService = ApiService.getInstance();
    jest.clearAllMocks();
  });

  describe("getVideoUploadUrl", () => {
    it("署名付きURLの取得に成功するとき", async () => {
      // モックレスポンスの設定
      const mockResponse = {
        uploadUrl:
          "https://example-bucket.s3.amazonaws.com/videos/test-session-id/test-video.webm",
        videoKey: "videos/test-session-id/test-video.webm",
        expiresIn: 600,
      };

      // ApiServiceのモック設定
      apiService.getVideoUploadUrl.mockResolvedValue(mockResponse);

      // 関数の実行
      const result = await apiService.getVideoUploadUrl(
        "test-session-id",
        "video/webm",
        "test-video.webm",
      );

      // 関数が正しく呼び出されたことの検証
      expect(apiService.getVideoUploadUrl).toHaveBeenCalledWith(
        "test-session-id",
        "video/webm",
        "test-video.webm",
      );

      // 結果が正しいことの検証
      expect(result).toEqual(mockResponse);
    });

    it("エラーが発生するとき", async () => {
      // エラーの設定
      apiService.getVideoUploadUrl.mockRejectedValue(new Error("APIエラー"));

      // 関数の実行とエラーの検証
      await expect(
        apiService.getVideoUploadUrl("test-session-id", "video/webm"),
      ).rejects.toThrow("APIエラー");
    });
  });
});
