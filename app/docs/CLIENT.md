Sì — e deve funzionare da riga di comando **come prima classe**, non come ripensamento.

La chiave è questa:
il pacchetto npm deve avere **un unico core** (la libreria) e una **CLI sottile sopra**.

Non sono due cose separate. È la stessa logica esposta in due modi.

---

# 🎯 Come si fa davvero (architettura corretta)

## 1️⃣ package.json

Devi dichiarare il comando CLI:

```json
{
  "name": "m2m-ads",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "m2m-ads": "dist/cli.js"
  }
}
```

Dopo:

```bash
npm install -g .
```

puoi fare:

```bash
m2m-ads register
```

---

# 🧠 2️⃣ Struttura codice minimale

```
src/
  index.ts          ← libreria (export client)
  cli.ts            ← entry CLI
  client.ts         ← core logica
  config.ts
  crypto.ts
```

---

# 🧩 3️⃣ CLI entry file

`src/cli.ts`

```ts
#!/usr/bin/env node

import { program } from 'commander'
import { register } from './commands/register.js'

program
  .command('register')
  .description('Register this machine')
  .action(register)

program.parse()
```

⚠ La prima riga `#!/usr/bin/env node` è fondamentale.

---

# 🧠 4️⃣ Core client (usato sia da CLI che da libreria)

`src/client.ts`

```ts
export class M2MClient {
  constructor(private config: Config) {}

  async register() {
    // chiama API
  }

  async publish(ad: AdInput) {
    // chiama API
  }
}
```

---

# 🖥 5️⃣ Comando CLI usa la libreria

`src/commands/register.ts`

```ts
import { M2MClient } from '../client'
import { loadConfig, saveConfig } from '../config'

export async function register() {
  const config = await loadConfig()
  const client = new M2MClient(config)

  const result = await client.register()

  await saveConfig(result)
  console.log('Registered:', result.machine_id)
}
```

CLI non contiene logica API.
Solo orchestrazione.

---

# 🧠 6️⃣ Config in ~/.m2m-ads

`config.ts`

```ts
import os from 'os'
import path from 'path'
import fs from 'fs/promises'

const BASE = process.env.M2M_ADS_HOME ||
  path.join(os.homedir(), '.m2m-ads')

export async function loadConfig() {
  const file = path.join(BASE, 'config.json')
  const data = await fs.readFile(file, 'utf-8')
  return JSON.parse(data)
}
```

---

# 🧪 7️⃣ Funziona in 3 modalità

### A) Globale

```bash
npm install -g m2m-ads
m2m-ads register
```

### B) Locale con npx

```bash
npx m2m-ads register
```

### C) Come libreria

```ts
import { M2MClient } from 'm2m-ads'
```

---

# ⚙ Build setup semplice

Con `tsup`:

```bash
npm install -D tsup
```

package.json:

```json
{
  "scripts": {
    "build": "tsup src/index.ts src/cli.ts --format esm --dts"
  }
}
```

---

# 🧠 Importante: ESM vs CJS

Nel 2026 meglio:

```
"type": "module"
```

E output ESM.

Evita CJS se puoi.

---

# 🎯 Risultato finale

Hai:

* Un pacchetto npm
* Usabile come:

  * Libreria
  * CLI
* Con config persistente
* Con chiavi locali
* Con PoW
* Con firma messaggi

È una vera infrastruttura per agenti.

---

Se vuoi, nel prossimo passo ti scrivo un mini template pronto all’uso che puoi copiare e partire subito.
