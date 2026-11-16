import { useEffect, useState } from "react";
import { lerNumero } from "./formato";

type Props = {
  valor: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  prefixo?: string;
  sufixo?: string;
  placeholder?: string;
  ariaLabel?: string;
};

/** Campo numérico que aceita vírgula e só devolve números válidos. */
export function CampoNumero({ valor, onChange, disabled, prefixo, sufixo, placeholder, ariaLabel }: Props) {
  const [texto, setTexto] = useState(formatar(valor));

  useEffect(() => {
    if (lerNumero(texto) !== valor) setTexto(formatar(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <span className="campo-numero">
      {prefixo && <span className="afixo">{prefixo}</span>}
      <input
        inputMode="decimal"
        value={texto}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = lerNumero(e.target.value);
          onChange(Number.isFinite(n) ? n : Number.NaN);
        }}
        onBlur={() => Number.isFinite(valor) && setTexto(formatar(valor))}
      />
      {sufixo && <span className="afixo">{sufixo}</span>}
    </span>
  );
}

function formatar(n: number): string {
  return Number.isFinite(n) ? String(n).replace(".", ",") : "";
}
