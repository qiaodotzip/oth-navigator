import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./errors";

/** Postgres's unique_violation, as pg and PGlite both raise it. */
const unique = Object.assign(new Error('duplicate key value violates unique constraint "rooms_pkey"'), {
  code: "23505",
});

/**
 * What drizzle throws since 0.45: the query and its parameters in the message,
 * the database's own error as the cause.
 */
function failedQuery(cause: unknown): Error {
  return Object.assign(new Error('Failed query: insert into "rooms" ("id") values ($1)\nparams: L1-shop'), {
    query: 'insert into "rooms" ("id") values ($1)',
    params: ["L1-shop"],
    cause,
  });
}

describe("isUniqueViolation", () => {
  it("sees the code on the error itself, as drizzle 0.36 and earlier threw it", () => {
    expect(isUniqueViolation(unique)).toBe(true);
  });

  it("sees it through drizzle's failed-query wrapper, which carries the database's error as the cause", () => {
    expect(isUniqueViolation(failedQuery(unique))).toBe(true);
  });

  it("sees it however deep the wrapping goes", () => {
    expect(isUniqueViolation(failedQuery(failedQuery(unique)))).toBe(true);
  });

  it("is false for another kind of database error, a check constraint", () => {
    const check = Object.assign(new Error("violates check constraint"), { code: "23514" });
    expect(isUniqueViolation(check)).toBe(false);
    expect(isUniqueViolation(failedQuery(check))).toBe(false);
  });

  it("is false for anything that carries no code at all", () => {
    expect(isUniqueViolation(new Error("nope"))).toBe(false);
    expect(isUniqueViolation(failedQuery(new Error("nope")))).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it("returns rather than looping when an error is its own cause", () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(isUniqueViolation(loop)).toBe(false);
  });
});
