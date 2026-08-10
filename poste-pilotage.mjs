#!/usr/bin/env node
/**
 * poste-pilotage.mjs — LE POSTE DE PILOTAGE : une seule page pour tout voir et tout lancer.
 *
 *   node poste-pilotage.mjs        puis http://localhost:2020
 *   (ou double-clic sur POSTE-DE-PILOTAGE.bat, qui fait les deux)
 *
 * RÔLE : répondre à « tout est éparpillé » (F. Henninot, 10/08/2026). Chaque outil de
 * l'écosystème est UN BLOC : ce que c'est, s'il tourne (sonde de port en direct),
 * un bouton pour le démarrer ou l'ouvrir, et ce qui reste à faire dessus.
 *
 * SÉCURITÉ : boucle locale seulement (127.0.0.1). Le serveur ne lance QUE les actions
 * de sa liste blanche BLOCS — jamais une commande venue de la requête.
 * PIÈGE : la démo du Bureau et le dépôt de travail partagent le port 8123 — pas les
 * deux en même temps ; c'est écrit sur les blocs.
 *
 * ENTRETIEN : la liste `aFaire` de chaque bloc est LA liste de reprise — Claude la met
 * à jour à chaque fin de chantier (règle : les conclusions vont dans le document).
 */
import { createServer } from "node:http";
import { connect } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const PORT = 2020;

/* ------------------------------------------------------------------ les blocs */
const BLOCS = [
  {
    id: "habilitation", groupe: "Centre d'habilitation fluides",
    titre: "inerWeb Habilitation — le logiciel du centre",
    quoi: "Sessions, épreuves, tablettes, attestations. Le lieu de travail unique.",
    port: 8123, url: "http://localhost:8123",
    lancer: { cwd: "C:\\git\\inerweb-habilitation", cible: "DEMARRER.bat" },
    aFaire: [
      "Valider les 2 recodages CO₂ (pk-cl4-1 → 13.14, pk-cl4-2 → 13.04)",
      "Feu vert sur 6 commits locaux (rien n'est poussé)",
    ],
  },
  {
    id: "demo-direction", groupe: "Centre d'habilitation fluides",
    titre: "Démo pour la direction (copie du Bureau)",
    quoi: "Écran « Mode démonstration » : centre fictif + visite guidée en 7 écrans, tout s'efface après. ⚠ Même port que le dépôt : pas les deux en même temps.",
    port: 8123, url: "http://localhost:8123",
    lancer: { cwd: "C:\\Users\\henni\\Desktop\\DEMO-inerWeb-Habilitation", cible: "DEMARRER.bat" },
    aFaire: ["Répéter la visite guidée avant le passage devant la direction"],
  },
  {
    id: "atelier", groupe: "Centre d'habilitation fluides",
    titre: "Atelier de relecture des 355 questions",
    quoi: "Juger, illustrer, attacher des remédiations. 331 remédiées et 36 illustrées posées par Claude, tout est annulable.",
    port: 2015, url: "http://localhost:2015",
    lancer: { cwd: "C:\\git\\inerweb-habilitation", cible: "cmd /c start \"Atelier de relecture\" node outils\\relecture-serveur.mjs", brut: true },
    aFaire: [
      "NE RELIRE qu'après le versement des photos de la bibliothèque (pas de double travail)",
      "Produire les photos de gestes manquantes : dudgeonnière, brasage, tirage au vide (G10/G11)",
    ],
  },
  {
    id: "habflu", groupe: "Centre d'habilitation fluides",
    titre: "Démonstrateur C:\\inerWeb-HabFlu",
    quoi: "L'installation témoin, base préservée.",
    port: 8143, url: "http://localhost:8143",
    lancer: { cwd: "C:\\inerWeb-HabFlu", cible: "DEMARRER.bat" },
    aFaire: ["Installer l'autorité du centre sur chaque tablette (cles\\autorite-du-centre.crt)"],
  },
  {
    id: "pilote", groupe: "Centre d'habilitation fluides",
    titre: "Auto-préparation publique (pilote-fluides)",
    quoi: "18 cours, 504 diapos, banque d'entraînement — le lien donné aux stagiaires.",
    ouvrir: "https://frigorx.github.io/pilote-fluides/",
    aFaire: ["Relecture métier en cours chez les collègues"],
  },
  {
    id: "tri", groupe: "Bibliothèque d'images",
    titre: "Tri des 44 011 images (gemma)",
    quoi: "Description automatique de la moisson. Reprise automatique chaque soir : indexation RAG à 21 h 45, tri à 22 h 00 — PC allumé, session ouverte.",
    fichierEtat: "C:\\git\\usine-contenu\\moteur-recherche\\illustrations\\descriptions.jsonl",
    total: 44011,
    lancer: { cwd: "C:\\git\\usine-contenu\\moteur-recherche", cible: "DECRIRE-ILLUSTRATIONS.cmd" },
    aFaire: ["Laisser le PC allumé deux nuits", "À la fin : passe photos sur l'atelier, puis relecture"],
  },
  {
    id: "curation", groupe: "Bibliothèque d'images",
    titre: "Curation des illustrations",
    quoi: "Rectifier, exclure, commenter — votre vérité terrain, elle prime partout sur le modèle.",
    port: 8735, url: "http://localhost:8735",
    lancer: { cwd: "C:\\git\\usine-contenu\\moteur-recherche", cible: "CURATION-ILLUSTRATIONS.cmd" },
    aFaire: ["Curer petit à petit sur l'année (votre plan)"],
  },
  {
    id: "explorateur", groupe: "Bibliothèque d'images",
    titre: "Explorateur des illustrations",
    quoi: "Chercher et voir les images décrites (s'ouvre dans le navigateur).",
    ouvrir: "C:\\git\\usine-contenu\\moteur-recherche\\illustrations\\EXPLORATEUR-ILLUSTRATIONS.html",
    aFaire: ["Régénérer après la fin du tri : python construire-explorateur-illustrations.py"],
  },
  {
    id: "hal", groupe: "HAL et le quotidien",
    titre: "HAL — l'assistant pédagogique",
    quoi: "Le Mur, observations, RAG local (28 511 extraits dont 12 324 images).",
    port: 2002, url: "http://localhost:2002",
    lancer: { cwd: "C:\\git\\HAL-v3", cible: "Demarrer-HAL.bat" },
    aFaire: ["Feu vert commits : inc. 268 (réclasseur) + inc. 269 (illustrations RAG), non commités"],
  },
  {
    id: "fluide", groupe: "HAL et le quotidien",
    titre: "inerWeb Fluide — traçabilité F-Gas",
    quoi: "Registre, CERFA, cycle matière.",
    port: 2011, url: "http://localhost:2011",
    lancer: { cwd: "C:\\git\\inerweb-fluide", cible: "lancer-inerweb.bat" },
    aFaire: ["Décision attendue : que franchit une intervention réelle d'atelier ?"],
  },
  {
    id: "trace", groupe: "HAL et le quotidien",
    titre: "Tableau de bord — la trace de tout",
    quoi: "L'historique de tous les chantiers, en une page.",
    ouvrir: "C:\\git\\tableau-de-bord\\index.html",
    aFaire: [],
  },
];

/* --------------------------------------------------------------- état en direct */
const sonderPort = (port) => new Promise((ok) => {
  const s = connect({ port, host: "127.0.0.1", timeout: 400 });
  s.on("connect", () => { s.destroy(); ok(true); });
  s.on("error", () => ok(false));
  s.on("timeout", () => { s.destroy(); ok(false); });
});

async function etat() {
  const sortie = {};
  for (const b of BLOCS) {
    if (b.port) sortie[b.id] = { enMarche: await sonderPort(b.port) };
    else if (b.fichierEtat && existsSync(b.fichierEtat)) {
      const lignes = readFileSync(b.fichierEtat, "utf8").split("\n").filter(Boolean).length;
      const age = (Date.now() - statSync(b.fichierEtat).mtimeMs) / 60000;
      sortie[b.id] = { compteur: lignes, total: b.total, enMarche: age < 3 };
    } else sortie[b.id] = {};
  }
  return sortie;
}

/* ------------------------------------------------------------------- actions */
function agir(bloc) {
  if (bloc.lancer) {
    const l = bloc.lancer;
    const commande = l.brut ? l.cible : `start "" "${l.cible}"`;
    spawn("cmd", ["/c", commande], { cwd: l.cwd, detached: true, stdio: "ignore", windowsHide: false }).unref();
    return "lancé : " + bloc.titre;
  }
  if (bloc.ouvrir) {
    spawn("cmd", ["/c", `start "" "${bloc.ouvrir}"`], { detached: true, stdio: "ignore" }).unref();
    return "ouvert : " + bloc.titre;
  }
  return "rien à lancer";
}

/* -------------------------------------------------------------------- la page */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function page() {
  const groupes = [...new Set(BLOCS.map((b) => b.groupe))];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Poste de pilotage inerWeb</title>
<style>
  /* Charte inerWeb — jamais de sombre ; l'état = couleur + trait + mot. */
  *{box-sizing:border-box} body{margin:0;background:#f7f1e7;color:#10233c;
    font-family:Calibri,"Segoe UI",system-ui,sans-serif;font-size:17px;line-height:1.5}
  header{background:#fffdf8;border-bottom:3px solid #1b3a63;padding:14px 22px}
  header h1{margin:0;color:#1b3a63;font-size:22px;font-family:"Trebuchet MS",sans-serif}
  header p{margin:4px 0 0;color:#637285;font-size:14px}
  main{max-width:1100px;margin:0 auto;padding:18px}
  h2{color:#1b3a63;font-size:17px;margin:22px 0 10px;border-left:5px solid #ff6b35;padding-left:10px}
  .blocs{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
  .bloc{background:#fffdf8;border:1px solid rgba(27,58,99,.18);border-radius:14px;padding:16px 18px;
    box-shadow:0 2px 8px rgba(27,58,99,.07);display:flex;flex-direction:column;gap:8px}
  .bloc h3{margin:0;font-size:16.5px;color:#1b3a63}
  .bloc .quoi{margin:0;font-size:14.5px;color:#3d4f66}
  .etat{font-size:13.5px;font-weight:700;border-radius:999px;padding:2px 12px;align-self:flex-start;border:2px solid}
  .etat.on{color:#1e7e54;border-color:#1e7e54;background:#eaf6f0}
  .etat.on::before{content:"● "} .etat.off::before{content:"○ "}
  .etat.off{color:#8a5200;border-color:#c9a227;background:#fdf6e3}
  .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
  button{font:inherit;min-height:42px;padding:6px 16px;border-radius:9px;cursor:pointer;
    border:2px solid #1b3a63;background:#fffdf8;color:#1b3a63;font-weight:700}
  button.principal{background:#1b3a63;color:#fff}
  button:focus-visible{outline:3px solid #ff6b35;outline-offset:2px}
  ul.afaire{margin:4px 0 0;padding-left:20px;font-size:13.5px;color:#5a4a12}
  ul.afaire li{margin:3px 0}
  .compteur{font-size:14px;color:#1b3a63;font-weight:700}
</style></head><body>
<header><h1>Poste de pilotage inerWeb</h1>
<p>Tout l'écosystème en une page — vert = en marche, jaune = à l'arrêt. Les listes « à faire » sont tenues à jour par Claude.</p></header>
<main>
${groupes.map((g) => `<h2>${esc(g)}</h2><div class="blocs">
${BLOCS.filter((b) => b.groupe === g).map((b) => `
  <div class="bloc" id="b-${b.id}">
    <h3>${esc(b.titre)}</h3>
    <span class="etat off" data-etat>…</span>
    <p class="quoi">${esc(b.quoi)}</p>
    ${b.aFaire.length ? `<ul class="afaire">${b.aFaire.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
    <div class="actions">
      ${b.lancer ? `<button class="principal" data-agir="${b.id}">Démarrer</button>` : ""}
      ${b.url ? `<button data-url="${esc(b.url)}">Ouvrir la page</button>` : ""}
      ${b.ouvrir ? `<button class="principal" data-agir="${b.id}">Ouvrir</button>` : ""}
    </div>
  </div>`).join("")}
</div>`).join("")}
</main>
<script>
const majEtat = async () => {
  const e = await fetch("/api/etat").then((r) => r.json());
  for (const [id, v] of Object.entries(e)) {
    const el = document.querySelector("#b-" + id + " [data-etat]"); if (!el) continue;
    if (v.compteur !== undefined) {
      el.className = "etat " + (v.enMarche ? "on" : "off");
      el.innerHTML = (v.enMarche ? "en cours — " : "à l'arrêt — ") +
        '<span class="compteur">' + v.compteur.toLocaleString("fr") + " / " + v.total.toLocaleString("fr") + "</span>";
    } else if (v.enMarche !== undefined) {
      el.className = "etat " + (v.enMarche ? "on" : "off");
      el.textContent = v.enMarche ? "en marche" : "à l'arrêt";
    } else { el.className = "etat on"; el.textContent = "toujours disponible"; }
  }
};
document.querySelectorAll("[data-agir]").forEach((b) => b.onclick = async () => {
  b.disabled = true; b.textContent = "…";
  await fetch("/api/agir", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: b.dataset.agir }) });
  setTimeout(() => { b.disabled = false; b.textContent = b.closest(".bloc").querySelector("[data-url]") ? "Démarrer" : "Ouvrir"; majEtat(); }, 3000);
});
document.querySelectorAll("[data-url]").forEach((b) => b.onclick = () => window.open(b.dataset.url, "_blank"));
majEtat(); setInterval(majEtat, 5000);
</script></body></html>`;
}

/* ------------------------------------------------------------------ serveur */
const serveur = createServer(async (req, rep) => {
  try {
    if (req.url === "/") { rep.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return rep.end(page()); }
    if (req.url === "/api/etat") { rep.writeHead(200, { "content-type": "application/json" }); return rep.end(JSON.stringify(await etat())); }
    if (req.url === "/api/agir" && req.method === "POST") {
      let corps = ""; req.on("data", (c) => (corps += c));
      req.on("end", () => {
        const { id } = JSON.parse(corps || "{}");
        const bloc = BLOCS.find((b) => b.id === id); // liste blanche : rien d'autre ne se lance
        rep.writeHead(bloc ? 200 : 404, { "content-type": "application/json" });
        rep.end(JSON.stringify({ resultat: bloc ? agir(bloc) : "bloc inconnu" }));
      });
      return;
    }
    rep.writeHead(404); rep.end("introuvable");
  } catch (e) { rep.writeHead(500); rep.end(String(e.message || e)); }
});

serveur.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Poste de pilotage — http://localhost:${PORT}`);
  console.log("  Une page, tout l'écosystème. Ctrl+C pour arrêter.\n");
});
