import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import {
  candidateEmailLookup,
  candidateInviteHash,
  decryptCandidateData,
  encryptCandidateData,
  isCandidateEncryptedWithActiveKey,
} from "../src/lib/privacy/candidate-encryption";

process.env.CANDIDATE_DATA_ENCRYPTION_KEY =
  randomBytes(32).toString("base64");

const candidateData = {
  name: "Jordan Example",
  email: "jordan@example.com",
  phone: "+1-555-0100",
  gender: null,
  birthday: null,
  notes: "Confidential hiring notes",
  education: null,
  school: null,
  major: null,
  graduationYear: null,
  workExperience: null,
  inviteToken: "secret-invite-token",
};

test("candidate fields are encrypted and round-trip with record-bound integrity", () => {
  const encrypted = encryptCandidateData("candidate-id", candidateData);

  assert.equal(encrypted.name, null);
  assert.equal(encrypted.email, null);
  assert.equal(encrypted.inviteToken, null);
  assert.equal(encrypted.encryptedData.includes(candidateData.email), false);
  assert.equal(encrypted.encryptedData.includes(candidateData.name), false);
  const decrypted = decryptCandidateData(encrypted);
  assert.deepEqual(decrypted, { id: "candidate-id", ...candidateData });
  assert.equal("encryptedData" in decrypted, false);
  assert.equal("emailLookup" in decrypted, false);
  assert.equal("inviteTokenHash" in decrypted, false);
  assert.throws(() =>
    decryptCandidateData({ ...encrypted, id: "different-record" }),
  );
});

test("email lookup is normalized and invite tokens are hashed independently", () => {
  assert.equal(
    candidateEmailLookup("  JORDAN@EXAMPLE.COM "),
    candidateEmailLookup("jordan@example.com"),
  );
  assert.notEqual(
    candidateInviteHash(candidateData.inviteToken),
    candidateEmailLookup(candidateData.inviteToken),
  );
  assert.notEqual(
    candidateInviteHash(candidateData.inviteToken),
    candidateData.inviteToken,
  );
});

test("invalid encryption keys fail closed", () => {
  const validKey = process.env.CANDIDATE_DATA_ENCRYPTION_KEY;
  try {
    process.env.CANDIDATE_DATA_ENCRYPTION_KEY = "not-a-32-byte-key";
    assert.throws(
      () => encryptCandidateData("id", candidateData),
      /32-byte key/,
    );
  } finally {
    process.env.CANDIDATE_DATA_ENCRYPTION_KEY = validKey;
  }
});

test("previous key decrypts records during an explicit key rotation", () => {
  const oldKey = process.env.CANDIDATE_DATA_ENCRYPTION_KEY!;
  const newKey = randomBytes(32).toString("base64");
  const oldRecord = encryptCandidateData("candidate-id", candidateData);

  try {
    process.env.CANDIDATE_DATA_ENCRYPTION_KEY = newKey;
    process.env.CANDIDATE_DATA_ENCRYPTION_KEY_PREVIOUS = oldKey;
    assert.equal(isCandidateEncryptedWithActiveKey(oldRecord.encryptedData), false);
    assert.deepEqual(
      decryptCandidateData(oldRecord).name,
      candidateData.name,
    );

    const rotated = encryptCandidateData(
      "candidate-id",
      decryptCandidateData(oldRecord),
    );
    assert.equal(isCandidateEncryptedWithActiveKey(rotated.encryptedData), true);
  } finally {
    process.env.CANDIDATE_DATA_ENCRYPTION_KEY = oldKey;
    delete process.env.CANDIDATE_DATA_ENCRYPTION_KEY_PREVIOUS;
  }
});
