import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import AuthForm from "../auth-form";

export const dynamic = "force-dynamic";
export default async function Setup() {
  const count = Number((await query<{ count: string }>("SELECT count(*) AS count FROM users")).rows[0].count);
  if (count) redirect("/login");
  const branding = (await query("SELECT * FROM branding WHERE id=1")).rows[0];
  return <AuthForm setup branding={branding} />;
}
