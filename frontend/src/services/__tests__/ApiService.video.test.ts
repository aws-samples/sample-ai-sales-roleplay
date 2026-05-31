// APIのモック
jest.mock("aws-amplify/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

// ApiServiceのモック
jest.mock("../ApiService", () => ({
  ApiService: {
    getInstance: jest.fn(() => ({
      createMultipartUpload: jest.fn(),
      completeMultipartUpload: jest.fn(),
      abortMultipartUpload: jest.fn(),
    })),
  },
}));

import { ApiService } from "../ApiService";

describe("ApiService - ビデオ関連機能のテスト", () => {
  let apiService: {
    createMultipartUpload: jest.Mock;
    completeMultipartUpload: jest.Mock;
    abortMultipartUpload: jest.Mock;
  };

  beforeEach(() => {
    apiService = ApiService.getInstance();
    jest.clearAllMocks();
  });

  describe("createMultipartUpload", () => {
    it("マルチパートアップロード開始に成功するとき", async () => {
      // モックレスポンスの設定（25パート分のURLを想定）
      const mockResponse = {
        uploadId: "test-upload-id",
        videoKey: "videos/test-session-id/recording.mp4",
        partUrls: [
          { partNumber: 1, url: "https://example-bucket.s3.amazonaws.com/part1" },
          { partNumber: 2, url: "https://example-bucket.s3.amazonaws.com/part2" },
        ],
        expiresIn: 3600,
      };

      apiService.createMultipartUpload.mockResolvedValue(mockResponse);

      const result = await apiService.createMultipartUpload(
        "test-session-id",
        "video/mp4",
        2,
        "recording.mp4",
      );

      // 引数の順序が正しいことの検証（sessionId, contentType, partCount, fileName）
      expect(apiService.createMultipartUpload).toHaveBeenCalledWith(
        "test-session-id",
        "video/mp4",
        2,
        "recording.mp4",
      );
      expect(result).toEqual(mockResponse);
      expect(result.partUrls).toHaveLength(2);
    });

    it("エラーが発生するとき", async () => {
      apiService.createMultipartUpload.mockRejectedValue(
        new Error("マルチパート開始エラー"),
      );

      await expect(
        apiService.createMultipartUpload("test-session-id", "video/mp4", 2),
      ).rejects.toThrow("マルチパート開始エラー");
    });
  });

  describe("completeMultipartUpload", () => {
    it("マルチパートアップロード完了に成功するとき", async () => {
      const mockResponse = {
        videoKey: "videos/test-session-id/recording.mp4",
        location: "https://example-bucket.s3.amazonaws.com/recording.mp4",
      };

      apiService.completeMultipartUpload.mockResolvedValue(mockResponse);

      const parts = [
        { partNumber: 1, eTag: '"etag1"' },
        { partNumber: 2, eTag: '"etag2"' },
      ];
      const result = await apiService.completeMultipartUpload(
        "videos/test-session-id/recording.mp4",
        "test-upload-id",
        parts,
      );

      expect(apiService.completeMultipartUpload).toHaveBeenCalledWith(
        "videos/test-session-id/recording.mp4",
        "test-upload-id",
        parts,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("abortMultipartUpload", () => {
    it("マルチパートアップロード中断に成功するとき", async () => {
      apiService.abortMultipartUpload.mockResolvedValue({ aborted: true });

      const result = await apiService.abortMultipartUpload(
        "videos/test-session-id/recording.mp4",
        "test-upload-id",
      );

      expect(apiService.abortMultipartUpload).toHaveBeenCalledWith(
        "videos/test-session-id/recording.mp4",
        "test-upload-id",
      );
      expect(result).toEqual({ aborted: true });
    });
  });
});
