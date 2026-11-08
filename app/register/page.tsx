import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <AuthShell title="Create a researcher account" subtitle="Students, faculty and graduate researchers can register here. Reviewer and secretariat accounts are created by the administrator.">
      <RegisterForm />
    </AuthShell>
  );
}
