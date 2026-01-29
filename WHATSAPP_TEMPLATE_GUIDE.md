# Ghid Template WhatsApp pentru Confirmare Programare

## Exemplu de Mesaj Final

Când un pacient primește confirmarea, va vedea un mesaj de genul:

```
✅ Programarea ta a fost înregistrată cu succes!

📅 Data: 29.01.2026
🕐 Ora: 20:00
👨‍⚕️ Medic: Dr. PAVEL Iulia
📍 Locație: SUPERSMILE SIBIU, Str. Octav Doicescu (completează adresa exactă aici)

Te așteptăm la cabinet!
```

---

## Cum să Creezi Template-ul în Meta Business Manager

### Pasul 1: Accesează Meta Business Manager
1. Mergi la https://business.facebook.com
2. Selectează contul tău WhatsApp Business
3. Mergi la **WhatsApp Manager** → **Message Templates**

### Pasul 2: Creează Template Nou
1. Click pe **"Create Template"**
2. Selectează categoria: **"MARKETING"** ⚡ (se aprobă instant, fără așteptare!)
3. Nume template: **`confirmare_programare1`** (exact acest nume!)
4. Limbă: **Română (ro)**

### Pasul 3: Conținutul Template-ului

**Header (opțional):**
- Poți lăsa gol sau adăuga text fix: "✅ Confirmare Programare"

**Body (textul principal):**
```
Programarea ta a fost înregistrată cu succes!

📅 Data: {{1}}
🕐 Ora: {{2}}
👨‍⚕️ Medic: {{3}}
📍 Locație: {{4}}

Te așteptăm la cabinet!
```

**Variabile:**
- `{{1}}` = Data programării (ex: "29.01.2026")
- `{{2}}` = Ora programării (ex: "20:00")
- `{{3}}` = Numele medicului (ex: "Dr. PAVEL Iulia")
- `{{4}}` = Locația + Adresa (ex: "SUPERSMILE SIBIU, Str. Octav Doicescu...")

**Footer (opțional):**
- Poți adăuga: "Super Smile - Cabinet Stomatologic"

### Pasul 4: Submit pentru Aprobare
1. Click pe **"Submit"**
2. ⚡ **Cu categoria MARKETING, template-ul se aprobă instant!** (fără așteptare)
3. După aprobare, template-ul va fi activ automat

---

## Variante Alternative de Template

### Varianta Simplă (fără emoji-uri)
```
Programarea ta a fost înregistrată cu succes.

Data: {{1}}
Ora: {{2}}
Medic: {{3}}
Locație: {{4}}

Te așteptăm la cabinet!
```

### Varianta Detaliată (cu mai multe informații)
```
✅ Confirmare Programare

Bună ziua!

Programarea ta a fost înregistrată cu succes în sistemul nostru.

Detalii programare:
📅 Data: {{1}}
🕐 Ora: {{2}}
👨‍⚕️ Medic: {{3}}
📍 Locație: {{4}}

Te rugăm să ajungi cu 10 minute înainte de programare.

Te așteptăm!
Super Smile
```

---

## Important!

1. **Numele template-ului** trebuie să fie exact: `confirmare_programare1` (lowercase, cu underscore și "1" la sfârșit)
2. **Categoria**: **MARKETING** ⚡ (se aprobă instant, fără așteptare!)
3. **Limbă**: `ro` (română)
4. **Variabilele** trebuie să fie în ordine: `{{1}}`, `{{2}}`, `{{3}}`, `{{4}}`
5. După aprobare (instant cu MARKETING), template-ul va funcționa automat pentru toate programările

---

## Testare

După ce template-ul este aprobat, poți testa prin:
1. Făcând o programare prin Autocalls.ai
2. Verificând că mesajul WhatsApp sosește corect
3. Verificând logs-urile pe Render pentru a vedea dacă template-ul a fost trimis cu succes

---

## Note Tehnice

Codul trimite template-ul cu următoarele parametri:
- **Template name**: `confirmare_programare1`
- **Language code**: `ro`
- **Body parameters**:
  - `{{1}}` = Data (format: "DD.MM.YYYY")
  - `{{2}}` = Ora (format: "HH:MM")
  - `{{3}}` = Nume medic (ex: "Dr. PAVEL Iulia")
  - `{{4}}` = Locație + Adresă (ex: "SUPERSMILE SIBIU, Str. Octav Doicescu...")

Dacă template-ul nu este aprobat sau nu există, codul va încerca un fallback cu mesaj text simplu (care poate funcționa doar dacă clientul a răspuns în ultimele 24h).
