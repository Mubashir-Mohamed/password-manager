import type { PasswordManagerClient } from "./client.js";

/** Client-side half of the HIBP k-anonymity check (build plan §4
 * "hibp-check"): the caller SHA-1-hashes the password locally, passes only
 * the 5-char prefix, and does the final suffix match itself — this module
 * never sees or transmits the password or full hash. */
export async function checkPasswordBreach(
  client: PasswordManagerClient,
  passwordSha1Prefix: string,
  passwordSha1Suffix: string,
): Promise<{ breached: boolean; count: number }> {
  const { data, error } = await client.functions.invoke("hibp-check", {
    body: { prefix: passwordSha1Prefix.toUpperCase() },
  });
  if (error) throw error;

  const suffixes: string = data.suffixes;
  for (const line of suffixes.split("\r\n")) {
    const [suffix, count] = line.split(":");
    if (suffix?.toUpperCase() === passwordSha1Suffix.toUpperCase()) {
      return { breached: true, count: Number(count ?? 0) };
    }
  }
  return { breached: false, count: 0 };
}
