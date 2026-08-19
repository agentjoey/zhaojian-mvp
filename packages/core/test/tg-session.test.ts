import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "../src/tg/session";
const S = "test-secret";
describe("tg session", () => {
  it("round-trip", () => {
    const exp = Math.floor(Date.now()/1000)+60;
    const t2 = signSession({ uid: "u1", tgId: 42, exp }, S);
    expect(verifySession(t2, S)).toEqual({ uid: "u1", tgId: 42, exp });
  });
  it("过期→null", () => {
    const t = signSession({ uid: "u1", tgId: 42, exp: Math.floor(Date.now()/1000)-1 }, S);
    expect(verifySession(t, S)).toBeNull();
  });
  it("篡改→null", () => {
    const t = signSession({ uid: "u1", tgId: 42, exp: Math.floor(Date.now()/1000)+60 }, S) + "x";
    expect(verifySession(t, S)).toBeNull();
  });
});
