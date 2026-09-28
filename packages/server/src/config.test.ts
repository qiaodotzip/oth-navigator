import { describe, expect, it } from "vitest";
import { isDeployed, loadConfig, teamCodeProblem, volumeProblem } from "./config";

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

describe("the volume on Railway", () => {
  const railway = { RAILWAY_ENVIRONMENT_NAME: "production", NODE_ENV: "production" };

  it("is not asked for off Railway, production or not", () => {
    expect(volumeProblem(loadConfig({}))).toBeNull();
    expect(volumeProblem(loadConfig({ NODE_ENV: "production", DATA_DIR: "/data" }))).toBeNull();
  });

  it("is required on Railway, where DATA_DIR without one is the container's disk, gone on the next deploy", () => {
    for (const env of [railway, { RAILWAY_PROJECT_ID: "a1b2c3" }]) {
      const said = volumeProblem(loadConfig({ ...env, DATA_DIR: "/data" }));
      expect(said).toMatch(/No volume is attached/);
      expect(said).toMatch(/Attach a volume at \/data to this service/);
    }
    // Railway will save an empty value; it is no volume either.
    expect(volumeProblem(loadConfig({ ...railway, DATA_DIR: "/data", RAILWAY_VOLUME_MOUNT_PATH: " " })))
      .toMatch(/No volume is attached/);
  });

  it("is satisfied when DATA_DIR is the volume, or a folder on it", () => {
    for (const dataDir of ["/data", "/data/", "/data/oth", "/data/./oth"]) {
      expect(volumeProblem(loadConfig({ ...railway, DATA_DIR: dataDir, RAILWAY_VOLUME_MOUNT_PATH: "/data" })), dataDir)
        .toBeNull();
    }
  });

  it("refuses a DATA_DIR that is not on the volume, saying where each is", () => {
    for (const dataDir of ["/tmp/oth", "/database", "/data/../etc", "./data", "/"]) {
      const said = volumeProblem(loadConfig({ ...railway, DATA_DIR: dataDir, RAILWAY_VOLUME_MOUNT_PATH: "/data" }));
      expect(said, dataDir).toMatch(/is not on the volume mounted at \/data/);
      expect(said, dataDir).toMatch(/Attach a volume at \/data to this service/);
    }
  });

  it("never repeats the team code in what it says", () => {
    const code = "red kite hill";
    for (const extra of [{}, { RAILWAY_VOLUME_MOUNT_PATH: "/data", DATA_DIR: "/tmp" }]) {
      expect(volumeProblem(loadConfig({ ...railway, TEAM_CODE: code, ...extra })) ?? "").not.toContain(code);
    }
  });
});
