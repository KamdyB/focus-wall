import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askStudyCoach, getStudyProgress, saveStudyProgress } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => "test-session-token") });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Study Lab summary sync and optional coach", () => {
  it("reads only the compact cross-device progress summary", async () => {
    const response = { progress: { version: 1, selected_resource: "spiral-matrix", completed_stages: ["Concept"], session_count: 2, logged_minutes: 75 }, updated_at: "2026-10-08T12:00:00Z" };
    fetchMock.mockResolvedValue({ ok: true, json: async () => response });

    await expect(getStudyProgress()).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith("/study-lab/progress", expect.objectContaining({
      headers: expect.objectContaining({ "X-App-Token": "test-session-token" }),
    }));
  });

  it("sends aggregate progress fields only, not notes or evidence", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ saved: true, updated_at: "2026-10-08T12:00:00Z" }) });
    const progress = { version: 1, selected_resource: "spiral-matrix", completed_stages: ["Concept"], session_count: 2, logged_minutes: 75 };

    await expect(saveStudyProgress(progress)).resolves.toMatchObject({ saved: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(progress);
    expect(init.body).not.toContain("notes");
    expect(init.body).not.toContain("evidence");
  });

  it("sends only the explicitly typed coaching question and short context", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reply: "What happens when the top row is exhausted?", model: "test-model" }) });
    await expect(askStudyCoach({ question: "I am stuck", resource: "Spiral Matrix", stages: ["Concept"] }))
      .resolves.toMatchObject({ reply: "What happens when the top row is exhausted?" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ question: "I am stuck", resource: "Spiral Matrix", stages: ["Concept"] });
  });

  it("surfaces authentication errors instead of falsely reporting sync success", async () => {
    fetchMock.mockResolvedValue({ ok: false, statusText: "Unauthorized", json: async () => ({ detail: "Sign in again" }) });
    await expect(getStudyProgress()).rejects.toThrow("Sign in again");
  });
});
