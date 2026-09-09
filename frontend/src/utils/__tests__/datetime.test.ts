import { parseServerDate, durationMsBetween } from "../datetime";

describe("parseServerDate", () => {
  it("タイムゾーン指定のない ISO 文字列を UTC として解釈する", () => {
    // "Z" が無い値。従来の new Date() ではローカルタイム扱いになりずれていた。
    const d = parseServerDate("2026-09-07T08:41:40.999128");
    expect(d.toISOString()).toBe("2026-09-07T08:41:40.999Z");
  });

  it('"Z" 付きの UTC 文字列をそのまま解釈する', () => {
    const d = parseServerDate("2026-09-07T08:44:18.494720Z");
    expect(d.toISOString()).toBe("2026-09-07T08:44:18.494Z");
  });

  it("+09:00 などのオフセット付き文字列を尊重する", () => {
    const d = parseServerDate("2026-09-07T17:41:40+09:00");
    expect(d.toISOString()).toBe("2026-09-07T08:41:40.000Z");
  });

  it("Z あり/なしの混在でも同一時刻として扱える (Issue #111 の中核)", () => {
    const start = parseServerDate("2026-09-07T08:41:40.999128"); // createdAt (Zなし)
    const end = parseServerDate("2026-09-07T08:44:18.494720Z"); // updatedAt (Zあり)
    const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);
    // 実際の所要は約2.6分。9時間ずれない。
    expect(diffMin).toBe(3);
  });

  it("空文字 / undefined / null は Invalid Date を返す", () => {
    expect(isNaN(parseServerDate("").getTime())).toBe(true);
    expect(isNaN(parseServerDate(undefined).getTime())).toBe(true);
    expect(isNaN(parseServerDate(null).getTime())).toBe(true);
  });

  it("日付のみの文字列は UTC 補完せずそのまま解釈する", () => {
    const d = parseServerDate("2026-09-07");
    expect(d.toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });
});

describe("durationMsBetween", () => {
  it("Z あり/なし混在でも正しい経過時間を返す", () => {
    const ms = durationMsBetween(
      "2026-09-07T08:41:40.999128",
      "2026-09-07T08:44:18.494720Z",
    );
    expect(Math.round(ms / 60000)).toBe(3);
  });

  it("いずれかが無効な場合は 0 を返す", () => {
    expect(durationMsBetween("", "2026-09-07T08:44:18Z")).toBe(0);
    expect(durationMsBetween("2026-09-07T08:41:40", undefined)).toBe(0);
  });
});
