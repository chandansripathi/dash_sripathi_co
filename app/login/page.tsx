import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import AuthForm from "../auth-form";

export const dynamic = "force-dynamic";
export default async function Login() {
  if (await getUser()) redirect("/");
  const count = Number((await query<{ count: string }>("SELECT count(*) AS count FROM users")).rows[0].count);
  if (!count) redirect("/setup");
  const branding = (await query("SELECT * FROM branding WHERE id=1")).rows[0];
  return <AuthForm branding={branding} />;
}
