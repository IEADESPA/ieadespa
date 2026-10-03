import { siteConfig } from "@/config/site";
import { enderecoCompleto, fetchConfiguracoes } from "@/lib/directus";

/** Escapa vírgula, ponto-e-vírgula e quebra de linha conforme o padrão vCard (RFC 6350). */
const escapeVcf = (value: string) => value.replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

export async function GET() {
  const config = await fetchConfiguracoes();
  const phoneDigits = config.phone?.replace(/\D/g, "");

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVcf(siteConfig.name)}`,
    `ORG:${escapeVcf(siteConfig.fullName)}`,
    `ADR;TYPE=WORK:;;${escapeVcf(config.address_line)};${escapeVcf(config.address_city)};${escapeVcf(config.address_state)};${escapeVcf(config.address_zip)};Brasil`,
    phoneDigits && `TEL;TYPE=WORK,VOICE:+55${phoneDigits}`,
    `EMAIL;TYPE=WORK:${siteConfig.email}`,
    `URL:${siteConfig.siteUrl}`,
    `NOTE:${escapeVcf(enderecoCompleto(config))}`,
    "END:VCARD",
  ].filter(Boolean);

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ieadespa.vcf"',
    },
  });
}
