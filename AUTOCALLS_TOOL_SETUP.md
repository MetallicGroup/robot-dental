# Configurare Mid-Call Tool în Autocalls.ai

## 1. Creează Tool-ul

### General Information
- **Name:** `get_doctor_availability`
- **Description:** 
```
Verifică disponibilitatea medicilor în sistemul clinicii pentru o dată și oră specificată. APELEAZĂ ACEST TOOL când clientul întreabă despre disponibilitate, spune data/ora programării, sau întreabă "ce medici au disponibilitate". Tool-ul returnează lista medicilor disponibili la ora respectivă, cu cabinetele lor. Dacă medicul solicitat nu este disponibil, returnează alternative. NU spune că ai "probleme tehnice" - apelează acest tool!
```

### Endpoint
- **URL:** `https://robot-dental.onrender.com/api/autocall/slots`
- **Method:** `GET`
- **Timeout:** `10` seconds

### Headers
- Opțional (poți șterge Content-Type pentru GET)

### Parameters
1. **date** (required, string)
   - Description: `Data programării în format DD.MM.YYYY (ex: "29.01.2026"). Dacă clientul spune "astăzi" sau "mâine", convertește în data calendaristică exactă.`
   
2. **time** (required, string)
   - Description: `Ora programării în format HH:MM (ex: "20:00"). Dacă clientul spune "ora 20", convertește în "20:00".`

3. **doctor_id** (optional, number)
   - Description: `ID-ul medicului dacă clientul a specificat un medic anume. Valori: 2 = Dr. PAVEL Iulia, 3 = Dr. UDECI Mădălina, 4 = Dr. COROIAN Andrei, 5 = Dr. CREȚIU Raul.`

4. **location_id** (optional, number)
   - Description: `ID-ul cabinetului dacă clientul a specificat un cabinet. Valori: 5 = SUPERSMILE SIBIU, 11 = SUPERSMILE ARHITECTILOR.`

---

## 2. Asignează Tool-ul la Assistant

**CRITIC:** Tool-ul trebuie asignat la assistant folosind `tool_ids` parameter!

### Cum să asignezi tool-ul:

1. Mergi la **Assistant** → **Edit Assistant**
2. Găsește secțiunea **"Mid-call tools"** sau **"Custom tools"**
3. Selectează tool-ul `get_doctor_availability` din listă
4. Sau folosește API-ul pentru a actualiza assistant-ul:
   ```json
   {
     "tool_ids": [ID_TOOL_ULUI]
   }
   ```

### Verificare:
- Tool-ul trebuie să apară în lista de tool-uri asignate la assistant
- Dacă nu apare, tool-ul nu va fi apelat în timpul apelului!

---

## 3. Actualizează Promptul

Copiază conținutul din `AUTOCALLS_PROMPT.md` în promptul assistant-ului din Autocalls.

---

## 4. Testează

1. **Testează tool-ul direct:**
   - Mergi la tool → "Make test request"
   - Ar trebui să returneze răspuns de test

2. **Testează cu apel real:**
   - Fă un apel de test
   - Verifică logs-urile pe Render pentru mesajele `[AUTOCALL TOOL]`
   - Dacă vezi logs, tool-ul este apelat corect!

---

## Troubleshooting

### Tool-ul nu este apelat în timpul apelului

**Verifică:**
1. ✅ Tool-ul este asignat la assistant? (vezi secțiunea 2)
2. ✅ Descrierea tool-ului este clară? (vezi secțiunea 1)
3. ✅ Promptul instruiește AI-ul să apeleze tool-ul? (vezi secțiunea 3)
4. ✅ Planul permite tool-uri mid-call? (verifică documentația planului)

### Tool-ul returnează eroare

**Verifică:**
1. ✅ URL-ul este corect: `https://robot-dental.onrender.com/api/autocall/slots`
2. ✅ Metoda este `GET`
3. ✅ Parametrii sunt configurați corect
4. ✅ Testează endpoint-ul direct în browser cu parametri

---

## Exemplu de răspuns tool

Tool-ul returnează JSON cu următoarea structură:

```json
{
  "date": "29.01.2026",
  "time": "20:00",
  "doctor_id": 4,
  "available": true,
  "doctors": [
    {
      "doctorId": 2,
      "doctorName": "Dr. PAVEL Iulia",
      "locations": [
        {
          "locationId": 5,
          "locationName": "SUPERSMILE SIBIU",
          "address": "Str. Octav Doicescu",
          "times": ["20:00"]
        }
      ]
    }
  ]
}
```

AI-ul trebuie să folosească acest răspuns pentru a răspunde clientului.
