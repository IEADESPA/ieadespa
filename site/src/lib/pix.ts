/**
 * Monta o payload "Pix Copia e Cola" (padrão EMV/BR Code do Banco Central,
 * o mesmo formato usado por qualquer app de banco pra ler um QR code de
 * Pix) — sem valor fixo (a pessoa digita o valor no próprio app), sem
 * nenhum serviço de terceiro envolvido. Cada campo é ID (2 dígitos) +
 * tamanho (2 dígitos) + valor; o CRC16 final garante que o app detecte
 * payload corrompido antes de tentar processar.
 */

interface PixPayloadInput {
  /** Chave Pix (CPF/CNPJ só dígitos, e-mail, telefone ou chave aleatória). */
  chave: string;
  /** Nome do recebedor — o app mostra isso pra quem for pagar. Máx. 25 caracteres, maiúsculo, sem acento. */
  nome: string;
  /** Cidade do recebedor. Máx. 15 caracteres, maiúsculo, sem acento. */
  cidade: string;
}

const semAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) — algoritmo exigido pelo padrão BR Code. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (const char of payload) {
    crc ^= char.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixPayload({ chave, nome, cidade }: PixPayloadInput): string {
  const merchantAccountInfo = campo("00", "br.gov.bcb.pix") + campo("01", chave);

  const semCrc =
    campo("00", "01") + // Payload Format Indicator
    campo("01", "11") + // Point of Initiation Method: 11 = estático, reutilizável
    campo("26", merchantAccountInfo) +
    campo("52", "0000") + // Merchant Category Code (não classificado)
    campo("53", "986") + // Moeda: 986 = Real (BRL)
    campo("58", "BR") +
    campo("59", semAcento(nome).slice(0, 25)) +
    campo("60", semAcento(cidade).slice(0, 15)) +
    campo("62", campo("05", "***")) + // Additional Data Field: txid genérico (sem referência específica)
    "6304"; // ID + tamanho do próprio CRC, sem o valor ainda

  return semCrc + crc16(semCrc);
}
