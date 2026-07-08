import { describe, it, expect } from "vitest";
import {
  ApiError,
  kindFromStatus,
  friendlyMessage,
  type ErrorsCopyTable,
} from "./errors";

const FULL_TABLE: ErrorsCopyTable = {
  network: { title: "Network error", description: "Check connection" },
  auth: { title: "Unauthorized", description: "Please log in", actionLabel: "Log in" },
  forbidden: { title: "Forbidden", description: "No access" },
  not_found: { title: "Not found", description: "Resource missing" },
  validation: { title: "Invalid input", description: "Check your data" },
  rate_limit: { title: "Too fast", description: "Slow down" },
  server: { title: "Server error", description: "Try later" },
  canceled: { title: "Canceled", description: "Request was canceled" },
  unknown: { title: "Unknown error", description: "Something went wrong" },
};

describe("kindFromStatus", () => {
  it("maps 401 to AUTH", () => expect(kindFromStatus(401)).toBe("AUTH"));
  it("maps 403 to FORBIDDEN", () => expect(kindFromStatus(403)).toBe("FORBIDDEN"));
  it("maps 404 to NOT_FOUND", () => expect(kindFromStatus(404)).toBe("NOT_FOUND"));
  it("maps 422 to VALIDATION", () => expect(kindFromStatus(422)).toBe("VALIDATION"));
  it("maps 400 to VALIDATION", () => expect(kindFromStatus(400)).toBe("VALIDATION"));
  it("maps 429 to RATE_LIMIT", () => expect(kindFromStatus(429)).toBe("RATE_LIMIT"));
  it("maps 500 to SERVER", () => expect(kindFromStatus(500)).toBe("SERVER"));
  it("maps 503 to SERVER", () => expect(kindFromStatus(503)).toBe("SERVER"));
  it("maps 418 to UNKNOWN", () => expect(kindFromStatus(418)).toBe("UNKNOWN"));
});

describe("friendlyMessage", () => {
  it("returns copy for a known ApiError kind", () => {
    const err = new ApiError({ kind: "NETWORK", status: 0, detail: "offline" });
    const copy = friendlyMessage(err, FULL_TABLE);
    expect(copy.title).toBe("Network error");
    expect(copy.description).toBe("Check connection");
  });

  it("returns actionLabel when present", () => {
    const err = new ApiError({ kind: "AUTH", status: 401, detail: "" });
    const copy = friendlyMessage(err, FULL_TABLE);
    expect(copy.actionLabel).toBe("Log in");
  });

  it("falls back to unknown for unrecognized ErrorKind via ApiError", () => {
    const err = new ApiError({ kind: "UNKNOWN", status: 0, detail: "" });
    const copy = friendlyMessage(err, FULL_TABLE);
    expect(copy.title).toBe("Unknown error");
  });

  it("returns unknown copy for null input", () => {
    const copy = friendlyMessage(null, FULL_TABLE);
    expect(copy.title).toBe("Unknown error");
    expect(copy.description).toBe("Something went wrong");
  });

  it("returns unknown copy for undefined input", () => {
    const copy = friendlyMessage(undefined, FULL_TABLE);
    expect(copy.title).toBe("Unknown error");
  });

  it("returns unknown copy for a plain Error", () => {
    const copy = friendlyMessage(new Error("boom"), FULL_TABLE);
    expect(copy.title).toBe("Unknown error");
  });

  it("returns unknown copy for a string input", () => {
    const copy = friendlyMessage("some string", FULL_TABLE);
    expect(copy.title).toBe("Unknown error");
  });

  it("returns hardcoded fallback for empty copy table", () => {
    const copy = friendlyMessage(null, {} as ErrorsCopyTable);
    expect(copy.title).toBe("Something went wrong");
    expect(copy.description).toBe("Please try again later.");
  });

  it("returns hardcoded fallback when table lacks the specific key AND unknown", () => {
    const err = new ApiError({ kind: "SERVER", status: 500, detail: "" });
    const copy = friendlyMessage(err, {} as ErrorsCopyTable);
    expect(copy.title).toBe("Something went wrong");
  });

  it("extracts validation hint from FastAPI JSON", () => {
    const err = new ApiError({
      kind: "VALIDATION",
      status: 422,
      detail: JSON.stringify({ detail: [{ msg: "field required", loc: ["body", "name"] }] }),
    });
    const copy = friendlyMessage(err, FULL_TABLE);
    expect(copy.description).toBe("field required");
  });

  it("extracts plain string detail from JSON", () => {
    const err = new ApiError({
      kind: "VALIDATION",
      status: 422,
      detail: JSON.stringify({ detail: "email is invalid" }),
    });
    const copy = friendlyMessage(err, FULL_TABLE);
    expect(copy.description).toBe("email is invalid");
  });

  it("uses base description when detail is not parseable", () => {
    const err = new ApiError({
      kind: "VALIDATION",
      status: 422,
      detail: "not json",
    });
    const copy = friendlyMessage(err, FULL_TABLE);
    expect(copy.description).toBe("not json");
  });
});

describe("ApiError", () => {
  it("has correct name and properties", () => {
    const err = new ApiError({ kind: "AUTH", status: 401, detail: "expired", requestId: "req-123" });
    expect(err.name).toBe("ApiError");
    expect(err.kind).toBe("AUTH");
    expect(err.status).toBe(401);
    expect(err.detail).toBe("expired");
    expect(err.requestId).toBe("req-123");
    expect(err instanceof Error).toBe(true);
  });
});
