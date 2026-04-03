import { describe, it, expect, vi, beforeEach } from "vitest";
const mockAppendFile = vi.fn();
const mockMkdir = vi.fn();
vi.mock("node:fs/promises", () => ({
    appendFile: (...args) => mockAppendFile(...args),
    mkdir: (...args) => mockMkdir(...args),
}));
import { log } from "../logger.js";
beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
});
describe("log", () => {
    it("creates log directory recursively", async () => {
        await log("test-event");
        expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(".claude-switch/logs"), { recursive: true });
    });
    it("writes log entry with ISO timestamp and event name", async () => {
        await log("switch");
        const entry = mockAppendFile.mock.calls[0][1];
        // ISO timestamp pattern: [2026-04-02T12:00:00.000Z]
        expect(entry).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] switch\n$/);
    });
    it("appends JSON detail when provided", async () => {
        await log("switch", { from: "claude", to: "ark" });
        const entry = mockAppendFile.mock.calls[0][1];
        expect(entry).toContain("switch ");
        expect(entry).toContain(JSON.stringify({ from: "claude", to: "ark" }));
        expect(entry).toMatch(/\n$/);
    });
    it("omits detail section when not provided", async () => {
        await log("test-event");
        const entry = mockAppendFile.mock.calls[0][1];
        expect(entry).not.toContain("{");
        expect(entry).toMatch(/test-event\n$/);
    });
    it("uses date-based log filename (YYYY-MM-DD.log)", async () => {
        await log("test");
        const filePath = mockAppendFile.mock.calls[0][0];
        expect(filePath).toMatch(/\d{4}-\d{2}-\d{2}\.log$/);
    });
    it("writes with mode 0o600", async () => {
        await log("test");
        const opts = mockAppendFile.mock.calls[0][2];
        expect(opts).toMatchObject({ mode: 0o600 });
    });
});
