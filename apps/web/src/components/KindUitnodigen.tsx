import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { inviteLink } from "@/lib/koppel";
import { Chip } from "@/components/ui";

/** Paneel voor de ouder: link, QR-code en (als reserve) de code waarmee het kind zelf inlogt. */
export function KindUitnodigen({ name, code, onClose }: { name: string; code: string; onClose(): void }) {
  const link = inviteLink(window.location.origin, code);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { void QRCode.toDataURL(link, { margin: 1, width: 360 }).then(setQr); }, [link]);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }
  const share = () => navigator.share({ title: "Notenkraker", text: `${name}, log in bij Notenkraker met deze link:`, url: link });

  return (
    <div role="dialog" aria-modal="true" aria-label={`${name} laten inloggen`} className="fixed inset-0 z-30 bg-fg/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-surface p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-xl m-0">{name} laten inloggen</h2>
          <button type="button" aria-label="Sluiten" onClick={onClose} className="text-2xl text-muted cursor-pointer">×</button>
        </div>
        <div className="flex flex-col sm:flex-row gap-5 items-center">
          {qr ? <img src={qr} alt={`QR-code om ${name} te laten inloggen`} className="w-40 h-40 rounded-xl bg-white" /> : <div className="w-40 h-40" />}
          <div className="flex flex-col gap-3 min-w-0 flex-1">
            <p className="m-0 text-sm">Laat {name} deze code scannen met de eigen iPad of telefoon, of stuur de link.</p>
            <div className="text-xs rounded-xl bg-bg px-3 py-2 truncate" title={link}>{link}</div>
            <div className="flex flex-wrap gap-2">
              {"share" in navigator && <Chip primary onClick={() => void share().catch(() => {})}>Delen</Chip>}
              <Chip onClick={() => void copy()}>{copied ? "Gekopieerd ✓" : "Kopieer link"}</Chip>
            </div>
          </div>
        </div>
        <p className="m-0 text-xs text-muted">
          Geen link? Laat {name} inloggen en deze code invullen: <b className="font-mono tracking-widest text-fg">{code}</b>. De link en de code werken één keer en zijn 7 dagen geldig.
        </p>
      </div>
    </div>
  );
}
