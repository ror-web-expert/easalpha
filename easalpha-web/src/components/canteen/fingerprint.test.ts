import { describe, expect, it } from "vitest";
import { fingerprintHash, sha256Hex } from "./fingerprint";

describe("canteen reader id hash", () => {
  it("computes SHA-256 as the standard vectors and Ruby's Digest::SHA256 do", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"); // two blocks
    expect(sha256Hex("ب".repeat(40))).toBe("78620e9ee3f643a58211ce3f439ba29ecf81c8708ad2537c92d832e86376d016"); // UTF-8
  });

  it("hashes the reader's id the way the API ships it: salt, colon, the id trimmed and lower-cased", () => {
    const api = "98cd2f6457cb1a98e5e0a3395e2a41e0f01304d864486f365a373dfced306f6b"; // CanteenSerializers.fingerprint_hash("FP-001", salt)
    expect(fingerprintHash("0b9f0c38-0000-4000-8000-000000000001", "FP-001")).toBe(api);
    expect(fingerprintHash("0b9f0c38-0000-4000-8000-000000000001", " fp-001 ")).toBe(api);
  });
});
