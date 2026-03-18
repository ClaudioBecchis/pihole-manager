# Pi-hole Desktop Manager

Applicazione desktop per monitorare e gestire in tempo reale server Pi-hole v6 su Proxmox.

Sviluppata con Electron (HTML/CSS/JavaScript). Compilata in un singolo `.exe` portatile per Windows.

## Funzionalita

### Monitoraggio (Modalita Base)
- **Dashboard** - 8 stat cards (query totali, bloccate, % blocco, domini blocklist, client attivi, domini unici, inoltrate, cache) + grafico query 24h
- **Query Log** - Log real-time delle query DNS con filtri (ricerca, stato permesso/bloccato, tipo A/AAAA/HTTPS/PTR/SRV), colori e badge
- **Top Domini** - Top domini richiesti, top bloccati, top client, upstream DNS
- **Gestione** - Enable/disable blocco (permanente e temporaneo), gestione Allow/Deny list, aggiornamento gravity con progress bar e log, restart DNS, flush log

### Impostazioni Avanzate
- **Adlists** - Gestione completa delle blocklist (aggiungi/rimuovi/attiva/disattiva), conteggio domini per lista
- **DNS & Record** - Configurazione upstream DNS, opzioni (DNSSEC, Domain Needed, Bogus Private, Query Logging, EDNS0, Block ESNI), record DNS locali (hosts), record CNAME
- **Sistema** - Gestione gruppi, gravity update, restart DNS, flush log
- **Log Pi-hole** - Log completo del server con filtri (tutto/bloccati/errori/inoltrati), ricerca testo, colori per tipo

### Generali
- **Multi-server** - Supporto per 2 server Pi-hole con switch istantaneo dal dropdown in sidebar
- **6 temi** - Default Darker, Default Dark, Default Light, High Contrast, High Contrast Dark, LCARS (Star Trek)
- **Auto-refresh** - Dashboard e query log si aggiornano automaticamente (intervallo configurabile)
- **Titlebar custom** - Finestra senza bordi Windows, titlebar integrata nel tema
- **Configurazione** - Dialog di setup al primo avvio con test connessione, modificabile dalle impostazioni

## Requisiti Server

- Pi-hole **v6.x** (testato con Core v6.4, FTL v6.5)
- API REST abilitata (default in v6)
- Password opzionale (funziona anche senza)

## Installazione

### Eseguibile portatile (Windows)
Scarica `PiHole.Manager.1.0.0.exe` dalla [pagina Releases](https://github.com/ClaudioBecchis/pihole-manager/releases) e lancialo. Non richiede installazione.

### Da sorgente
```bash
git clone https://github.com/ClaudioBecchis/pihole-manager.git
cd pihole-manager
npm install
npm start
```

### Build .exe
```bash
npm run build
```
L'eseguibile viene generato in `dist/`.

## Configurazione

Al primo avvio si apre il dialog di configurazione. Inserisci:

| Campo | Descrizione |
|-------|-------------|
| **Nome Server** | Nome identificativo (es. "Pi-hole Primary") |
| **Host / IP** | Indirizzo IP del server Pi-hole (es. 192.168.10.100) |
| **Porta** | Porta HTTP (default: 80) |
| **Password** | Password Pi-hole (lascia vuoto se non impostata) |

Dopo il primo avvio, le impostazioni sono modificabili dal pulsante in fondo alla sidebar.

## API Pi-hole v6 Utilizzate

| Endpoint | Descrizione |
|----------|-------------|
| `GET /api/stats/summary` | Statistiche generali |
| `GET /api/history` | Query nel tempo (24h) |
| `GET /api/queries` | Log query recenti |
| `GET /api/stats/top_domains` | Top domini richiesti/bloccati |
| `GET /api/stats/top_clients` | Top client |
| `GET /api/stats/upstreams` | Upstream DNS |
| `GET /api/dns/blocking` | Stato blocco |
| `POST /api/dns/blocking` | Enable/disable blocco |
| `GET /api/domains` | Liste allow/deny |
| `GET /api/lists` | Adlists (blocklist) |
| `GET /api/groups` | Gruppi |
| `GET /api/config` | Configurazione completa |
| `GET /api/logs/dnsmasq` | Log Pi-hole |
| `POST /api/action/gravity` | Aggiornamento gravity |
| `POST /api/action/restartdns` | Restart DNS |

## Struttura Progetto

```
pihole-manager/
  package.json          # Configurazione npm + electron-builder
  src/
    main.js             # Electron main process (finestra, IPC)
    preload.js          # Bridge sicuro main<->renderer
    pihole-api.js       # Client API Pi-hole v6 (fetch)
    index.html          # UI completa (HTML + CSS temi)
    renderer.js         # Logica UI, polling, rendering pagine
```

## Tecnologie

- **Electron 33** - Framework desktop
- **HTML/CSS/JavaScript** - UI nativa senza framework aggiuntivi
- **Pi-hole v6 REST API** - Comunicazione diretta via fetch
- **electron-builder** - Build .exe portatile

## Licenza

MIT License - vedi [LICENSE](LICENSE)
