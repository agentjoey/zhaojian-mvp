import { supabaseAdmin } from "./admin";

export async function mergeAnonProfiles(
  anonAccessToken: string,
  targetUserId: string,
): Promise<{ merged: number }> {
  const admin = supabaseAdmin();
  const { data: u } = await admin.auth.getUser(anonAccessToken);
  const anon = u?.user;
  if (!anon || anon.id === targetUserId || !(anon as any).is_anonymous) {
    return { merged: 0 };
  }

  const anonId = anon.id;

  // Reassign this anon user's profiles to the target (TG) account.
  const { data: rows, error } = await admin
    .from("profiles")
    .update({ user_id: targetUserId })
    .eq("user_id", anonId)
    .select("id");

  if (error) {
    console.error("merge profiles error", error);
    return { merged: 0 };
  }

  // spirit_messages also has its own user_id column (see 0002 migration),
  // so keep it consistent with the re-assigned profiles.
  await admin
    .from("spirit_messages")
    .update({ user_id: targetUserId })
    .eq("user_id", anonId)
    .then(({ error }) => {
      if (error) console.error("merge spirit_messages error", error);
    });

  return { merged: rows?.length ?? 0 };
}
