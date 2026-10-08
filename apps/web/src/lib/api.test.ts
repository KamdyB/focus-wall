import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStudyLabState, saveStudyLabState } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => "test-session-token") });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Study Lab cloud persistence client", () => {
  it("reads the cloud snapshot using the authenticated API client", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, updated_at: null }),
    });

    await expect(getStudyLabState()).resolves.toEqual({ data: null, updated_at: null });
    expect(fetchMock).toHaveBeenCalledWith("/study-lab", expect.objectContaining({
      headers: expect.objectContaining({ "X-App-Token": "test-session-token" }),
    }));
  });

  it("sends the full snapshot via PUT without changing the local-first contract", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true, updated_at: "2026-10-08T12:00:00+00:00" }),
    });
    const data = { version: 1, saved: { selected: "spiral-matrix", records: [] } };

    await expect(saveStudyLabState(data)).resolves.toMatchObject({ saved: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ data });
  });

  it("surfaces authentication or network errors so local data is not falsely reported as synced", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: "Unauthorized",
      json: async () => ({ detail: "Sign in again" }),
    });

    await expect(getStudyLabState()).rejects.toThrow("Sign in again");
  });
});
