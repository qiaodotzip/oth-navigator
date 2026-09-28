import { describe, expect, it } from "vitest";
import { isDeployed, loadConfig, teamCodeProblem } from "./config";

describe("TEAM_CODE", () => {
  it("reads a blank value as unset, and trims what is there", () => {
    expect(loadConfig({ TEAM_CODE: "   " }).TEAM_CODE).toBeUndefined();
    expect(loadConfig({ TEAM_CODE: "  red kite hill  " }).TEAM_CODE).toBe("red kite hill");
  });

  it("is not needed locally or in tests", () => {
    expect(teamCodeProblem(loadConfig({}))).toBeNull();
    expect(teamCodeProblem(loadConfig({ NODE_ENV: "test" }))).toBeNull();
  });

  it("is required in production, where the app would otherwise be open to anyone", () => {
    expect(teamCodeProblem(loadConfig({ NODE_ENV: "production" }))).toMatch(/TEAM_CODE is not set/);
    expect(teamCodeProblem(loadConfig({ NODE_ENV: "production", TEAM_CODE: "" }))).toMatch(/TEAM_CODE is not set/);
  });

  it("refuses a code short enough to guess", () => {
    expect(teamCodeProblem(loadConfig({ NODE_ENV: "production", TEAM_CODE: "1234567" }))).toMatch(/shorter than 8/);
    expect(teamCodeProblem(loadConfig({ NODE_ENV: "production", TEAM_CODE: "red kite hill" }))).toBeNull();
  });

  it("never repeats the code in what it says", () => {
    const said = teamCodeProblem(loadConfig({ NODE_ENV: "production", TEAM_CODE: "short1" })) ?? "";
    expect(said).not.toContain("short1");
  });

  it("is required wherever Railway runs the app, whatever NODE_ENV says", () => {
    for (const railway of [{ RAILWAY_ENVIRONMENT_NAME: "production" }, { RAILWAY_PROJECT_ID: "a1b2c3" }]) {
      for (const nodeEnv of [{}, { NODE_ENV: "development" }, { NODE_ENV: "test" }]) {
        const env = { ...railway, ...nodeEnv };
        expect(isDeployed(loadConfig(env))).toBe(true);
        expect(teamCodeProblem(loadConfig(env))).toMatch(/TEAM_CODE is not set/);
        expect(teamCodeProblem(loadConfig({ ...env, TEAM_CODE: "1234567" }))).toMatch(/shorter than 8/);
        expect(teamCodeProblem(loadConfig({ ...env, TEAM_CODE: "red kite hill" }))).toBeNull();
      }
    }
  });

  it("reads a blank Railway variable as not on Railway", () => {
    expect(isDeployed(loadConfig({ RAILWAY_ENVIRONMENT_NAME: " ", RAILWAY_PROJECT_ID: "" }))).toBe(false);
  });
});
