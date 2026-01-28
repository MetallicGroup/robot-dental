# Configurare iStoma pentru integrare WhatsApp Bot

## Ce trebuie configurat în platforma iStoma

Pentru ca botul WhatsApp să poată programa pacienți în iStoma, trebuie să ai următoarele configurate corect:

### 1. **Cheie API și URL**

- **URL Base**: `https://supersmilesib.digitalclinic.ro/api/PacientAPI/`
- **Cheie API**: Cheia ta reală din contract (nu cea de test)
- **Act adițional**: "Mobile pacient view" activat (24 RON +TVA x numărul de scaune / lună)

### 2. **Structură clinică** (Setări → Structură clinică)

- **Sedii** (Sediile tale):
  - Ex: SUPERSMILE SIB, SUPERSMILE - ARHITECTILOR
  - Fiecare sediu trebuie să aibă un **ID** (se vede în `GetListaSedii`)

- **Cabinete** (Unități funcționale):
  - Ex: Cabinet 1, Cabinet 2
  - Fiecare cabinet trebuie asociat unui sediu
  - Fiecare cabinet trebuie să aibă un **ID** (se vede în răspunsurile `GetListaIntervaleActivitate`)

### 3. **Medici** (Resurse umane → Echipa)

- **Medicii trebuie să fie creați**:
  - Dr. COROIAN Andrei
  - Dr. CRETIU Raul
  - Dr. PAVEL Iulia
  - Dr. UDECI Madalina

- **Fiecare medic trebuie să aibă**:
  - Un **ID** (se vede în `GetMedici`)
  - **Program de lucru** definit (zilele și orele când lucrează)
  - **Asociere la sediu și cabinet** (unde lucrează)

### 4. **Program medici** (Agendă → Program medici)

**CRITIC**: Pentru ca `GetListaIntervaleActivitate` să returneze sloturi, trebuie:

- **Programul să fie definit** pentru fiecare medic:
  - Zilele în care lucrează (Luni-Vineri, etc.)
  - Intervalele orare (ex: 08:00-20:00)
  - **Sediul** unde lucrează
  - **Cabinetul** unde lucrează

- **Dacă programul nu este definit** sau medicul nu e asociat la cabinet/sediu:
  - `GetListaIntervaleActivitate` va returna `null`
  - `AdaugaProgramare` va returna eroare 500/400

### 5. **Categorii de programare**

- Botul trimite `pCategorie = "Consultatie"`
- Trebuie să existe o categorie cu acest nume în iStoma sau să fie acceptată de sistem

## ID-uri configurate (fallback)

Dacă `GetMedici` returnează null, botul folosește aceste ID-uri:
- **Dr. PAVEL Iulia**: ID = 2
- **Dr. UDECI Madalina**: ID = 3
- **Dr. COROIAN Andrei**: ID = 4
- **Dr. CRETIU Raul**: ID = 5

**Cabinete**:
- **Cabinet 1**: ID = 1 (nr crt 1)
- **Cabinet 2**: ID = 2 (nr crt 2)

## Verificare rapidă

### Test 1: Verifică medici și sedii

Deschide în browser:
```
https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetMedici?pCheie=CHEIA_TA
https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetListaSedii?pCheie=CHEIA_TA
```

**Notă**: API-ul returnează **XML**, nu JSON. Dacă vezi `<ArrayOfMedicAPIModel i:nil="true"/>`, înseamnă că nu găsește medici (verifică că medicii au "www activ" setat).

Ar trebui să vezi liste cu medici și sedii în format XML.

### Test 2: Verifică sloturi disponibile

```
GET https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetListaIntervaleActivitate
  ?pCheie=CHEIA_TA
  &pDataInceputZZLLAAAA=28012026
  &pDataSfarsitZZLLAAAA=28012026
  &pOraInceput=08
  &pOraFinal=21
  &pListaIdMedici=1,2,3,4,5
  &pIdSediu=3
```

**Dacă răspunsul este `<ArrayOfIntervalCabinetAPIModel i:nil="true"/>`**:
- Verifică că medicii au program definit pentru data respectivă
- Verifică că medicii sunt asociați la sediu și cabinet
- Verifică că programul include intervalul 08:00-21:00 (conform programului tău)
- Verifică că medicii au "www activ" setat

### Test 3: Testează programare directă

**IMPORTANT**: `AdaugaProgramare` trebuie apelat cu **POST** și **form data**, nu GET cu query params!

Folosește un tool ca Postman sau curl:
```bash
curl -X POST https://supersmilesib.digitalclinic.ro/api/PacientAPI/AdaugaProgramare \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "pCheie=CHEIA_TA" \
  -d "pNumeCompletPacient=Test Nume" \
  -d "pTelefonPacient=40712345678" \
  -d "pAdresaMailPacient=" \
  -d "pDataDDMMYYYYHHMM=280120261030" \
  -d "pDurataInMinute=30" \
  -d "pIdSpecialist=2" \
  -d "pIdCabinet=1" \
  -d "pCategorie=Consultatie" \
  -d "pObservatii=Test"
```

**Răspuns așteptat**: `"13"` sau `<string>13</string>` (XML) pentru succes.

**Dacă primești 500/400/404**:
- Verifică că folosești **POST**, nu GET
- Verifică că `pIdSpecialist` (medic) există și are program în ziua respectivă
- Verifică că `pIdCabinet` este un ID valid (1 sau 2 pentru Cabinet 1/2)
- Verifică că data/ora este în intervalul de program al medicului (08:00-21:00)

## Ce face botul automat

1. **Caută pacientul**: `VerificaPacient` după telefon
2. **Creează pacientul dacă nu există**: `AdaugaPacient`
3. **Caută sloturi**: `GetListaIntervaleActivitate` → `GetPrimeleSloturiLibere`
4. **Programează**: `AdaugaProgramare` → fallback `AdaugaSolicitareProgramareCuData`

**Dacă totul e configurat corect în iStoma**, botul ar trebui să funcționeze automat.

## Probleme comune

### "GetMedici returnează `<ArrayOfMedicAPIModel i:nil="true"/>`"
- **Cauză**: Medici fără "www activ" setat sau cheie API invalidă
- **Soluție**: 
  - Verifică că toți medicii au "www activ" setat în iStoma
  - Verifică că cheia API este corectă
  - Botul va folosi ID-urile fallback (2, 3, 4, 5) dacă GetMedici returnează null

### "GetListaIntervaleActivitate returnează `<ArrayOfIntervalCabinetAPIModel i:nil="true"/>`"
- **Cauză**: Medici fără program definit sau fără asociere la sediu/cabinet
- **Soluție**: 
  - Definește programul pentru fiecare medic în iStoma (08:00-21:00)
  - Asociază medicii la sediu și cabinet
  - Botul va genera sloturi sintetice dacă API-ul returnează null

### "AdaugaProgramare returnează 404"
- **Cauză**: Request-ul este trimis ca GET în loc de POST
- **Soluție**: Botul folosește acum POST cu form data corect

### "AdaugaProgramare returnează 500"
- **Cauză**: Medic/cabinet invalid sau program necompatibil
- **Soluție**: Verifică că medicul are program în ziua/ora respectivă și că cabinetul este valid (1 sau 2)

### "AdaugaSolicitareProgramareCuData returnează 400"
- **Cauză**: Parametri invalizi (sediu, categorie, etc.)
- **Soluție**: Verifică că `pIdSediu` și `pCategorie` sunt valori valide în iStoma
