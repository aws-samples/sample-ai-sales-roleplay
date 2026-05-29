import {
  loadVideoRecordingEnabled,
  saveVideoRecordingEnabled,
  DEFAULT_VIDEO_RECORDING_ENABLED,
} from "../videoRecordingSettings";

describe("videoRecordingSettings", () => {
  // 各テスト前にlocalStorageとconsole.warnのモックをリセット
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  describe("loadVideoRecordingEnabled", () => {
    test("未設定の場合はデフォルト値（true）を返す", () => {
      expect(loadVideoRecordingEnabled()).toBe(DEFAULT_VIDEO_RECORDING_ENABLED);
      expect(loadVideoRecordingEnabled()).toBe(true);
    });

    test('"true"が保存されている場合はtrueを返す', () => {
      localStorage.setItem("videoRecordingEnabled", "true");
      expect(loadVideoRecordingEnabled()).toBe(true);
    });

    test('"false"が保存されている場合はfalseを返す', () => {
      localStorage.setItem("videoRecordingEnabled", "false");
      expect(loadVideoRecordingEnabled()).toBe(false);
    });

    test("不正な値の場合はfalse扱い（=true以外）になる", () => {
      localStorage.setItem("videoRecordingEnabled", "invalid");
      expect(loadVideoRecordingEnabled()).toBe(false);
    });

    test("localStorageが例外を投げる場合はデフォルト値にフォールバックする", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => { });
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });

      expect(loadVideoRecordingEnabled()).toBe(DEFAULT_VIDEO_RECORDING_ENABLED);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe("saveVideoRecordingEnabled", () => {
    test("trueを保存できる", () => {
      saveVideoRecordingEnabled(true);
      expect(localStorage.getItem("videoRecordingEnabled")).toBe("true");
    });

    test("falseを保存できる", () => {
      saveVideoRecordingEnabled(false);
      expect(localStorage.getItem("videoRecordingEnabled")).toBe("false");
    });

    test("localStorageが例外を投げても例外を伝播させない", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => { });
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });

      expect(() => saveVideoRecordingEnabled(false)).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe("保存と読み込みの往復", () => {
    test("保存した値を正しく読み込める", () => {
      saveVideoRecordingEnabled(false);
      expect(loadVideoRecordingEnabled()).toBe(false);

      saveVideoRecordingEnabled(true);
      expect(loadVideoRecordingEnabled()).toBe(true);
    });
  });
});
