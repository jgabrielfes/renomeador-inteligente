"use client";

// Campo de data com digitação manual E calendário: o texto aceita dd/mm/aaaa
// com as barras entrando sozinhas, e o ícone abre o date picker do shadcn
// (Calendar + Popover). O valor exposto é SEMPRE ISO (yyyy-mm-dd) ou "" —
// o formato que o motor e as APIs usam. Digitação incompleta/ inválida não
// dispara onChange; no blur o texto volta ao último valor válido.

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { ptBR } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function isoParaTexto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// Máscara enquanto digita: só dígitos, barras automáticas (dd/mm/aaaa).
function mascararData(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// dd/mm/aaaa → ISO, recusando data de calendário inválida (31/02…).
function textoParaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function DateInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  /** ISO (yyyy-mm-dd) ou "". */
  value: string;
  onChange: (iso: string) => void;
}) {
  const [texto, setTexto] = React.useState(() => isoParaTexto(value));
  const [aberto, setAberto] = React.useState(false);

  // Valor mudou por fora (picker, leitura do cofre, restauro): re-deriva o
  // texto em fase de render — padrão do React para estado derivado de prop.
  const [ultimoValor, setUltimoValor] = React.useState(value);
  if (value !== ultimoValor) {
    setUltimoValor(value);
    setTexto(isoParaTexto(value));
  }

  const aoDigitar = (bruto: string) => {
    const mascarado = mascararData(bruto);
    setTexto(mascarado);
    const iso = textoParaIso(mascarado);
    if (iso) {
      setUltimoValor(iso);
      onChange(iso);
    } else if (mascarado === "" && value !== "") {
      setUltimoValor("");
      onChange("");
    }
  };

  const selecionar = (data: Date | undefined) => {
    if (data) {
      const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
      setUltimoValor(iso);
      setTexto(isoParaTexto(iso));
      onChange(iso);
    }
    setAberto(false);
  };

  const selecionada = value ? new Date(`${value}T12:00:00`) : undefined;
  const anoAtual = new Date().getFullYear();

  return (
    <div className="relative">
      <Input
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        autoComplete="off"
        className={`num pr-9 ${className ?? ""}`}
        value={texto}
        onChange={(e) => aoDigitar(e.target.value)}
        onBlur={() => {
          if (!textoParaIso(texto)) setTexto(isoParaTexto(value));
        }}
        {...props}
      />
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
              aria-label="Abrir o calendário"
            />
          }
        >
          <CalendarIcon className="size-4" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            locale={ptBR}
            // Dropdown de mês/ano: datas de nascimento e casamentos antigos
            // ficam alcançáveis; a folga futura cobre vigência da reforma.
            captionLayout="dropdown"
            startMonth={new Date(1900, 0)}
            endMonth={new Date(anoAtual + 10, 11)}
            selected={selecionada}
            defaultMonth={selecionada}
            onSelect={selecionar}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
