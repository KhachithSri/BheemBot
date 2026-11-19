import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

export type CandidateSensitiveData = {
  name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  birthday: string | null;
  notes: string | null;
  education: string | null;
  school: string | null;
  major: string | null;
  graduationYear: number | null;
  workExperience: string | null;
  inviteToken: string;
};

type CandidateStoredRow = {
  id: string;
  encryptedData?: string | null;
  emailLookup?: string | null;
  inviteTokenHash?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  birthday?: string | null;
  notes?: string | null;
  education?: string | null;
  school?: string | null;
  major?: string | null;
  graduationYear?: number | null;
  workExperience?: string | null;
  inviteToken?: string | null;
};

type DecryptedCandidate<T> = Omit<
  T,
  | keyof CandidateSensitiveData
  | "encryptedData"
  | "emailLookup"
  | "inviteTokenHash"
> &
  CandidateSensitiveData;

function encryptionKey(): Buffer {
  return decodeKey(
    process.env.CANDIDATE_DATA_ENCRYPTION_KEY,
    "CANDIDATE_DATA_ENCRYPTION_KEY",
  );
}

function decodeKey(encoded: string | undefined, name: string): Buffer {
  if (!encoded) {
    throw new Error(`${name} is required`);
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error(
      `${name} must be a canonical base64-encoded 32-byte key`,
    );
  }
  return key;
}

function encryptionKeyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function decryptionKey(keyId: string): Buffer {
  const activeKey = encryptionKey();
  if (encryptionKeyId(activeKey) === keyId) return activeKey;

  const previousKey = process.env.CANDIDATE_DATA_ENCRYPTION_KEY_PREVIOUS
    ? decodeKey(
        process.env.CANDIDATE_DATA_ENCRYPTION_KEY_PREVIOUS,
        "CANDIDATE_DATA_ENCRYPTION_KEY_PREVIOUS",
      )
    : null;
  if (previousKey && encryptionKeyId(previousKey) === keyId) return previousKey;

  throw new Error(`Candidate encryption key ${keyId} is not configured`);
}

export function activeCandidateEncryptionKeyId(): string {
  return encryptionKeyId(encryptionKey());
}

export function isCandidateEncryptedWithActiveKey(
  encryptedData: string | null,
): boolean {
  if (!encryptedData) return false;
  const [version, keyId] = encryptedData.split(".");
  if (version !== "v1" || !keyId) {
    throw new Error("Unsupported candidate ciphertext format");
  }
  return keyId === activeCandidateEncryptionKeyId();
}

function lookupHash(kind: "email" | "invite", value: string): string {
  return createHmac("sha256", encryptionKey())
    .update(`candidate-${kind}:v1:${value}`)
    .digest("hex");
}

export function candidateEmailLookup(email: string): string {
  return lookupHash("email", email.trim().toLowerCase());
}

export function candidateInviteHash(token: string): string {
  return lookupHash("invite", token);
}

export function encryptCandidateData(
  id: string,
  data: CandidateSensitiveData,
) {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`candidate:${id}:v1`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  const encryptedData = [
    "v1",
    encryptionKeyId(key),
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");

  return {
    id,
    encryptedData,
    emailLookup: data.email ? candidateEmailLookup(data.email) : null,
    inviteTokenHash: data.inviteToken
      ? candidateInviteHash(data.inviteToken)
      : null,
    name: null,
    email: null,
    phone: null,
    gender: null,
    birthday: null,
    notes: null,
    education: null,
    school: null,
    major: null,
    graduationYear: null,
    workExperience: null,
    inviteToken: null,
  };
}

export function decryptCandidateData<T extends CandidateStoredRow>(
  row: T,
): DecryptedCandidate<T> {
  const publicRow = { ...row };
  delete publicRow.encryptedData;
  delete publicRow.emailLookup;
  delete publicRow.inviteTokenHash;

  if (row.encryptedData) {
    const [
      version,
      keyId,
      encodedIv,
      encodedTag,
      encodedCiphertext,
      ...extra
    ] =
      row.encryptedData.split(".");
    if (
      version !== "v1" ||
      !keyId ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext ||
      extra.length > 0
    ) {
      throw new Error(`Unsupported candidate ciphertext for ${row.id}`);
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      decryptionKey(keyId),
      Buffer.from(encodedIv, "base64"),
    );
    decipher.setAAD(Buffer.from(`candidate:${row.id}:v1`));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    return {
      ...publicRow,
      ...(JSON.parse(plaintext) as CandidateSensitiveData),
    } as DecryptedCandidate<T>;
  }

  return {
    ...publicRow,
    name: row.name ?? "",
    email: row.email ?? null,
    phone: row.phone ?? null,
    gender: row.gender ?? null,
    birthday: row.birthday ?? null,
    notes: row.notes ?? null,
    education: row.education ?? null,
    school: row.school ?? null,
    major: row.major ?? null,
    graduationYear: row.graduationYear ?? null,
    workExperience: row.workExperience ?? null,
    inviteToken: row.inviteToken ?? "",
  } as DecryptedCandidate<T>;
}
