import { describe, expect, it } from "vitest";
import { pickAudioType, timeLabel } from "./opname";

describe("pickAudioType", () => {
  it("kiest webm/opus als de browser dat kan, anders mp4 (Safari)", () => {
    expect(pickAudioType((t) => t.startsWith("audio/webm"))).toEqual({ mimeType: "audio/webm;codecs=opus", ext: "webm" });
    expect(pickAudioType((t) => t === "audio/mp4")).toEqual({ mimeType: "audio/mp4", ext: "m4a" });
    expect(pickAudioType(() => false)).toEqual({ mimeType: "", ext: "webm" });
  });
});

describe("timeLabel", () => {
  it("toont minuten en seconden", () => {
    expect(timeLabel(0)).toBe("0:00");
    expect(timeLabel(48.6)).toBe("0:48");
    expect(timeLabel(72)).toBe("1:12");
  });
});
