# Template WhatsApp pentru Alternative Disponibile

## Problema

Când medicul solicitat nu este disponibil sau nu există disponibilitate, trimitem mesaje WhatsApp text simple. Aceste mesaje pot eșua cu eroarea "Re-engagement message" dacă au trecut mai mult de 24h de la ultimul răspuns al clientului.

## Soluție

Creează un template WhatsApp pentru mesajele cu alternative disponibile.

---

## Cum să Creezi Template-ul

### 1. Accesează Meta Business Manager
1. Mergi la https://business.facebook.com
2. Selectează contul tău WhatsApp Business
3. Mergi la **WhatsApp Manager** → **Message Templates**

### 2. Creează Template Nou
1. Click pe **"Create Template"**
2. Selectează categoria: **"MARKETING"** ⚡ (se aprobă instant, fără așteptare!)
3. Nume template: **`alternative_disponibile`** (exact acest nume!)
4. Limbă: **Română (ro)**

### 3. Conținutul Template-ului

**Header (opțional):**
- Poți lăsa gol sau adăuga text fix: "⚠️ Disponibilitate"

**Body (textul principal):**
```
Îmi pare rău, dar {{1}} nu este disponibil la ora {{2}} în ziua {{3}}.

{{4}}

Scrie "vreau altă oră" sau "schimbă programarea" pentru a alege o altă opțiune.
```

**Variabile:**
- `{{1}}` = Numele medicului solicitat (ex: "Dr. COROIAN Andrei")
- `{{2}}` = Ora solicitată (ex: "21:00")
- `{{3}}` = Data solicitată (ex: "29.01.2026")
- `{{4}}` = Lista medici disponibili sau mesaj "Nu există medici disponibili la această oră"

**Footer (opțional):**
- Poți adăuga: "Super Smile - Cabinet Stomatologic"

### 4. Submit pentru Aprobare
1. Click pe **"Submit"**
2. ⚡ **Cu categoria MARKETING, template-ul se aprobă instant!**
3. După aprobare, template-ul va fi activ automat

---

## Actualizare Cod

După ce template-ul este aprobat, trebuie să actualizezi codul în `server.js` pentru a folosi noul template în loc de mesaj text simplu.

**Locație în cod:** `server.js` - secțiunea unde se trimite mesajul cu alternative (după linia ~656)

---

## Exemplu de Mesaj Final

Când un client primește mesajul cu alternative, va vedea:

```
Îmi pare rău, dar Dr. COROIAN Andrei nu este disponibil la ora 21:00 în ziua 29.01.2026.

În schimb, la ora 21:00 în ziua 29.01.2026 sunt disponibili următorii medici:
1. Dr. PAVEL Iulia - SUPERSMILE SIBIU

Scrie "vreau altă oră" sau "schimbă programarea" pentru a alege o altă opțiune.
```

---

## Important!

1. **Numele template-ului** trebuie să fie exact: `alternative_disponibile` (lowercase, cu underscore)
2. **Categoria**: **MARKETING** ⚡ (se aprobă instant!)
3. **Limbă**: `ro` (română)
4. **Variabilele** trebuie să fie în ordine: `{{1}}`, `{{2}}`, `{{3}}`, `{{4}}`
5. După aprobare, va funcționa automat pentru toate mesajele cu alternative

---

## Note

- Template-ul este necesar pentru a evita eroarea "Re-engagement message"
- Dacă nu creezi template-ul, mesajele cu alternative pot eșua când au trecut mai mult de 24h de la ultimul răspuns
- Template-ul permite trimiterea mesajelor chiar și după 24h
