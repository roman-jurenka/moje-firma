// Malý IMAP klient nad nativním TLS spojením Deno (Deno.connectTls).
// Nahrazuje imapflow, které v Supabase Edge Runtime (přes node:tls) zasekávalo
// stahování větších odpovědí (obsah zprávy), zatímco malé odpovědi procházely.
// Umí jen to, co Pošta potřebuje: LOGIN, LIST, SELECT, UID SEARCH/FETCH/STORE/MOVE, APPEND.

const enc = new TextEncoder();
const dec = new TextDecoder();

export type Odpoved = { radky: { text: string; literaly: Uint8Array[] }[]; stav: string; zbytek: string };

const sCasem = <T>(p: Promise<T>, ms: number, co: string) =>
  Promise.race([p, new Promise<never>((_, chyba) => setTimeout(() => chyba(new Error(`IMAP timeout: ${co}`)), ms))]);

const uvozovky = (s: string) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const MESICE = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const imapDatum = (d: Date) => `${d.getUTCDate()}-${MESICE[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

export class Imap {
  private conn!: Deno.TlsConn;
  private buf = new Uint8Array(0);
  private tag = 0;
  private constructor() {}

  static async pripojit(host: string, port: number, user: string, pass: string, limitMs = 20_000) {
    const k = new Imap();
    k.conn = await sCasem(Deno.connectTls({ hostname: host, port }), limitMs, "připojení");
    await sCasem(k.radek(), limitMs, "uvítání");
    const r = await k.prikaz(`LOGIN ${uvozovky(user)} ${uvozovky(pass)}`, limitMs);
    if (r.stav !== "OK") { k.zavrit(); throw new Error("Přihlášení ke schránce selhalo (zkontrolujte SMTP_USER / SMTP_PASS)."); }
    return k;
  }

  private async docti(): Promise<boolean> {
    const kus = new Uint8Array(64 * 1024);
    const n = await this.conn.read(kus);
    if (n === null) return false;
    const novy = new Uint8Array(this.buf.length + n);
    novy.set(this.buf); novy.set(kus.subarray(0, n), this.buf.length);
    this.buf = novy;
    return true;
  }

  private async radek(): Promise<string> {
    for (;;) {
      const i = this.buf.indexOf(10);
      if (i >= 0) {
        const r = dec.decode(this.buf.subarray(0, i)).replace(/\r$/, "");
        this.buf = this.buf.slice(i + 1);
        return r;
      }
      if (!(await this.docti())) throw new Error("IMAP spojení bylo ukončeno.");
    }
  }

  private async bajty(n: number): Promise<Uint8Array> {
    // literál (obsah zprávy) číst rovnou do připraveného pole — bez opakovaného kopírování bufferu
    const out = new Uint8Array(n);
    let off = Math.min(this.buf.length, n);
    out.set(this.buf.subarray(0, off));
    this.buf = this.buf.slice(off);
    while (off < n) {
      const m = await this.conn.read(out.subarray(off));
      if (m === null) throw new Error("IMAP spojení bylo ukončeno.");
      off += m;
    }
    return out;
  }

  // Jedna odpověď (řádek + případné literály {N}) — vrací text bez literálů a literály zvlášť.
  private async odpoved(): Promise<{ text: string; literaly: Uint8Array[] }> {
    let text = "";
    const literaly: Uint8Array[] = [];
    for (;;) {
      const r = await this.radek();
      const m = r.match(/\{(\d+)\}$/);
      if (!m) { text += r; return { text, literaly }; }
      text += r.slice(0, -m[0].length) + `{L${literaly.length}}`;
      literaly.push(await this.bajty(Number(m[1])));
    }
  }

  async prikaz(cmd: string, limitMs = 30_000, literal?: Uint8Array): Promise<Odpoved> {
    const t = `A${++this.tag}`;
    const beh = async () => {
      if (literal) {
        await this.conn.write(enc.encode(`${t} ${cmd} {${literal.length}}\r\n`));
        const pokr = await this.odpoved();
        if (!pokr.text.startsWith("+")) throw new Error("IMAP neočekávaná odpověď: " + pokr.text.slice(0, 100));
        await this.conn.write(literal);
        await this.conn.write(enc.encode("\r\n"));
      } else {
        await this.conn.write(enc.encode(`${t} ${cmd}\r\n`));
      }
      const radky: Odpoved["radky"] = [];
      for (;;) {
        const o = await this.odpoved();
        if (o.text.startsWith(t + " ")) {
          const [, stav, ...zb] = o.text.split(" ");
          return { radky, stav, zbytek: zb.join(" ") };
        }
        radky.push(o);
      }
    };
    return await sCasem(beh(), limitMs, cmd.split(" ").slice(0, 2).join(" "));
  }

  async slozky() {
    const r = await this.prikaz(`LIST "" "*"`);
    return r.radky.filter((x) => x.text.startsWith("* LIST")).map((x) => {
      const m = x.text.match(/^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (.*)$/i);
      const atributy = (m?.[1] || "").split(/\s+/).filter(Boolean);
      let jmeno = (m?.[2] || "").trim();
      const lit = jmeno.match(/^\{L(\d+)\}$/);
      if (lit) jmeno = dec.decode(x.literaly[Number(lit[1])]);
      else if (jmeno.startsWith('"')) jmeno = jmeno.slice(1, -1).replace(/\\(.)/g, "$1");
      return { jmeno, atributy };
    });
  }

  async vybrat(slozka: string, jenCteni = false) {
    const r = await this.prikaz(`${jenCteni ? "EXAMINE" : "SELECT"} ${uvozovky(slozka)}`);
    if (r.stav !== "OK") throw new Error(`Složku ${slozka} nejde otevřít: ${r.zbytek}`);
    let validity = 0, exists = 0;
    for (const x of r.radky) {
      const v = x.text.match(/UIDVALIDITY (\d+)/i); if (v) validity = Number(v[1]);
      const e = x.text.match(/^\* (\d+) EXISTS/i); if (e) exists = Number(e[1]);
    }
    return { validity, exists };
  }

  async hledat(kriterium: string): Promise<number[]> {
    const r = await this.prikaz(`UID SEARCH ${kriterium}`);
    return r.radky.filter((x) => x.text.startsWith("* SEARCH")).flatMap((x) => x.text.slice(8).trim().split(/\s+/).filter(Boolean).map(Number));
  }

  // Metadata jedné zprávy: příznaky, datum, velikost
  async info(uid: number) {
    const r = await this.prikaz(`UID FETCH ${uid} (UID FLAGS INTERNALDATE RFC822.SIZE)`);
    const x = r.radky.find((y) => / FETCH /i.test(y.text) && new RegExp(`UID ${uid}\\b`).test(y.text));
    if (!x) return null;
    const flags = new Set(((x.text.match(/FLAGS \(([^)]*)\)/i)?.[1]) || "").split(/\s+/).filter(Boolean));
    const datum = x.text.match(/INTERNALDATE "([^"]+)"/i)?.[1];
    const velikost = Number(x.text.match(/RFC822\.SIZE (\d+)/i)?.[1] || 0);
    return { flags, datum: datum ? new Date(datum.replace(/^(\d+)-(\w+)-(\d+) /, "$2 $1 $3 ")) : null, velikost };
  }

  // Celý zdroj zprávy (BODY.PEEK nemění příznak přečteno), nebo jen hlavička
  async zdroj(uid: number, jenHlavicka = false, limitMs = 30_000): Promise<Uint8Array | null> {
    const r = await this.prikaz(`UID FETCH ${uid} (UID BODY.PEEK[${jenHlavicka ? "HEADER" : ""}])`, limitMs);
    const x = r.radky.find((y) => / FETCH /i.test(y.text) && y.literaly.length);
    return x ? x.literaly[0] : null;
  }

  async priznak(uid: number, priznak: string, pridat: boolean) {
    return await this.prikaz(`UID STORE ${uid} ${pridat ? "+" : "-"}FLAGS.SILENT (${priznak})`);
  }

  async presunout(uid: number, cil: string) {
    const r = await this.prikaz(`UID MOVE ${uid} ${uvozovky(cil)}`);
    if (r.stav === "OK") return;
    const c = await this.prikaz(`UID COPY ${uid} ${uvozovky(cil)}`);
    if (c.stav !== "OK") throw new Error("Přesun do koše selhal: " + c.zbytek);
    await this.priznak(uid, "\\Deleted", true);
    await this.prikaz(`UID EXPUNGE ${uid}`).catch(() => this.prikaz("EXPUNGE"));
  }

  async pridat(slozka: string, zprava: Uint8Array, priznaky = "(\\Seen)") {
    const r = await this.prikaz(`APPEND ${uvozovky(slozka)} ${priznaky}`, 60_000, zprava);
    if (r.stav !== "OK") throw new Error("Uložení do Odeslaných selhalo: " + r.zbytek);
  }

  async odhlasit() {
    try { await this.prikaz("LOGOUT", 5000); } catch { /* nic */ }
    this.zavrit();
  }

  zavrit() { try { this.conn.close(); } catch { /* nic */ } }
}
