"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function loginAction(
  _prevState: { erro?: string } | undefined,
  formData: FormData
) {
  const matricula = String(formData.get("matricula") ?? "");
  const senha = String(formData.get("senha") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");

  try {
    await signIn("credentials", {
      matricula,
      senha,
      redirectTo: callbackUrl || "/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { erro: "Matrícula ou senha inválidas." };
    }
    throw error;
  }
}
