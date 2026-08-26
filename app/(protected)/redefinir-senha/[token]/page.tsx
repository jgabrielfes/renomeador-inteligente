import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { RedefinirSenhaForm } from "./redefinir-senha-form";

// Destino do link do e-mail de redefinição. O token É a credencial desta
// página (como no portal do herdeiro): a validação real acontece na server
// action, ao gravar — token inválido/vencido ganha o aviso com o caminho de
// pedir outro.
export default async function RedefinirSenhaPage({
  params,
}: PageProps<"/redefinir-senha/[token]">) {
  const { token } = await params;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Criar uma senha nova</CardTitle>
          <CardDescription>
            Escolha a nova senha da sua conta. Ela vale a partir de agora, em
            todos os seus acessos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RedefinirSenhaForm token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
