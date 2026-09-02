/**
 * Lockup da marca LexCausa — o mesmo desenho em toda a aplicação: "Lex" no
 * acento, "Causa" na tinta, serifa institucional. `href` decide para onde o
 * clique leva (landing deslogada, hub logado). A submarca de produto entra
 * pelo `sub` ("LexCausa" fica a cargo do chamador).
 */

import Link from 'next/link';

export function MarcaLexCausa({
  href = '/',
  sub,
}: {
  href?: string;
  sub?: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <Link className="lc-marca" href={href}>
        <span className="lc-marca-lex">Lex</span>Causa
      </Link>
      {sub && <span className="lc-lockup">{sub}</span>}
    </span>
  );
}
