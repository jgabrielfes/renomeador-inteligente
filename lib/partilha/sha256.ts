/**
 * SHA-256 INCREMENTAL em TypeScript puro — o `crypto.subtle.digest` exige o
 * buffer inteiro em memória, o que não serve para hashear PDFs grandes em
 * blocos de 8 MB (manifesto de documentos). Implementação clássica (FIPS
 * 180-4), validada nos testes contra o próprio `crypto.subtle`.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class Sha256 {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private buffer = new Uint8Array(64);
  private noBuffer = 0;
  private totalBytes = 0;
  private w = new Uint32Array(64);
  private fechado = false;

  update(dados: Uint8Array): this {
    if (this.fechado) throw new Error('digest já finalizado');
    this.totalBytes += dados.length;
    let i = 0;
    if (this.noBuffer > 0) {
      const falta = Math.min(64 - this.noBuffer, dados.length);
      this.buffer.set(dados.subarray(0, falta), this.noBuffer);
      this.noBuffer += falta;
      i = falta;
      if (this.noBuffer === 64) {
        this.bloco(this.buffer, 0);
        this.noBuffer = 0;
      }
    }
    for (; i + 64 <= dados.length; i += 64) this.bloco(dados, i);
    if (i < dados.length) {
      this.buffer.set(dados.subarray(i), 0);
      this.noBuffer = dados.length - i;
    }
    return this;
  }

  /** Finaliza e devolve o digest em hex minúsculo. */
  hex(): string {
    if (!this.fechado) {
      this.fechado = true;
      const bits = this.totalBytes * 8;
      const fim = new Uint8Array(((this.noBuffer + 8) >> 6 << 6) + 64);
      fim.set(this.buffer.subarray(0, this.noBuffer));
      fim[this.noBuffer] = 0x80;
      const dv = new DataView(fim.buffer);
      dv.setUint32(fim.length - 8, Math.floor(bits / 0x1_0000_0000), false);
      dv.setUint32(fim.length - 4, bits >>> 0, false);
      for (let i = 0; i < fim.length; i += 64) this.bloco(fim, i);
    }
    return [...this.h].map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  private bloco(dados: Uint8Array, off: number): void {
    const w = this.w;
    for (let t = 0; t < 16; t++) {
      const i = off + t * 4;
      w[t] = (dados[i] << 24) | (dados[i + 1] << 16) | (dados[i + 2] << 8) | dados[i + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rot(w[t - 15], 7) ^ rot(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rot(w[t - 2], 17) ^ rot(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = this.h as unknown as number[];
    for (let t = 0; t < 64; t++) {
      const S1 = rot(e, 6) ^ rot(e, 11) ^ rot(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rot(a, 2) ^ rot(a, 13) ^ rot(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
    this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0;
    this.h[7] = (this.h[7] + h) | 0;
  }
}

function rot(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** Bloco de leitura do manifesto: 8 MB por vez, sem estourar memória. */
export const BLOCO_HASH = 8 * 1024 * 1024;

/** SHA-256 de um Blob/File lendo em blocos — utilizável no worker e fora. */
export async function sha256DeBlob(
  blob: Blob,
  onProgresso?: (lidos: number, total: number) => void,
): Promise<string> {
  const h = new Sha256();
  for (let off = 0; off < blob.size; off += BLOCO_HASH) {
    const pedaco = blob.slice(off, Math.min(off + BLOCO_HASH, blob.size));
    h.update(new Uint8Array(await pedaco.arrayBuffer()));
    onProgresso?.(Math.min(off + BLOCO_HASH, blob.size), blob.size);
  }
  return h.hex();
}
