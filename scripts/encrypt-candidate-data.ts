import {
  decryptCandidateData,
  encryptCandidateData,
  isCandidateEncryptedWithActiveKey,
} from "../src/lib/privacy/candidate-encryption";
import { supabaseAdmin } from "../src/lib/supabase/admin";

const PAGE_SIZE = 200;

async function encryptExistingCandidates() {
  let encryptedCount = 0;
  const rotate = process.argv.includes("--rotate");
  let offset = 0;

  while (true) {
    let query = supabaseAdmin
      .from("candidates")
      .select("*")
      .order("id");
    query = rotate
      ? query.range(offset, offset + PAGE_SIZE - 1)
      : query.is("encryptedData", null).range(0, PAGE_SIZE - 1);
    const { data: rows, error } = await query;

    if (error) throw new Error(`Failed to load candidates: ${error.message}`);
    if (!rows?.length) break;

    for (const row of rows) {
      if (rotate && isCandidateEncryptedWithActiveKey(row.encryptedData)) {
        continue;
      }
      const candidate = decryptCandidateData(row);
      const encrypted = encryptCandidateData(candidate.id, {
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        gender: candidate.gender,
        birthday: candidate.birthday,
        notes: candidate.notes,
        education: candidate.education,
        school: candidate.school,
        major: candidate.major,
        graduationYear: candidate.graduationYear,
        workExperience: candidate.workExperience,
        inviteToken: candidate.inviteToken,
      });

      let updateQuery = supabaseAdmin
        .from("candidates")
        .update(encrypted)
        .eq("id", candidate.id);
      if (!rotate) updateQuery = updateQuery.is("encryptedData", null);
      const { data: updated, error: updateError } = await updateQuery
        .select("id")
        .single();

      if (updateError || !updated) {
        throw new Error(
          `Failed to encrypt candidate ${candidate.id}: ${updateError?.message ?? "No row was updated"}`,
        );
      }
      encryptedCount += 1;
    }

    if (rotate) offset += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(
    `${rotate ? "Re-encrypted" : "Encrypted"} ${encryptedCount} candidate records.`,
  );
}

encryptExistingCandidates().catch((error: unknown) => {
  console.error("Candidate encryption migration failed:", error);
  process.exitCode = 1;
});
